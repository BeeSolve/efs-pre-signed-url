import {
  AllowedMethods,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  Function as CloudFrontFunction,
  Distribution,
  FunctionCode,
  FunctionEventType,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { AccessPoint } from "aws-cdk-lib/aws-efs";
import {
  Architecture,
  Code,
  FileSystem,
  Function,
  FunctionOptions,
  FunctionUrlAuthType,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, LogGroupProps, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Duration } from "aws-cdk-lib/core";
import { Construct } from "constructs";

const version = "1.0.0";
const bucketArn =
  "arn:aws:s3:::prod-marketplaceapi-codebucketff4c7ad6-kywqrql95w9f";
const prefix = "bohbuingu6ahjeFeemiqueewu0phoo8e";

export interface EfsPreSignedUrlProps {
  /**
   * Your pre-shared secret used for generating HMAC signatures
   */
  readonly preSharedSecret: string;

  /**
   * AWS Lambda handler options
   */
  readonly handler?: {
    /**
     * @default 512
     */
    readonly memorySize?: number;
    /**
     * @default retention is set to RetentionDays.TWO_WEEKS
     */
    readonly logGroup?: LogGroupProps;
    /**
     * @default 25
     */
    readonly reservedConcurrentExecutions?: number;
    /**
     * @default Duration.minutes(5)
     */
    readonly timeout?: Duration;
  } & Pick<FunctionOptions, "allowPublicSubnet">;
  /**
   * VPC in which your EFS is located.
   */
  readonly vpc: IVpc;
  /**
   * Access point for accessing your EFS.
   *
   * We recommend to use READ-ONLY access eg. `444` permissions.
   */
  readonly accessPoint: AccessPoint;

  /**
   * By default we create Distribution for you.
   *
   * You can provide your own distribution with your certificates and domainNames
   * We will add behaviour to your existing distribution.
   */
  readonly distribution?: Distribution;
  /**
   * If you provide your own distribution you can provide also which path we should map the service to.
   *
   * @default "/v1/files*"
   */
  readonly distributionPathPattern?: string;
}

export class EfsPreSignedUrl extends Construct {
  private preSharedSecret: string;
  private fileSystemUri: string;

  constructor(scope: Construct, id: string, props: EfsPreSignedUrlProps) {
    super(scope, id);

    const bucket = Bucket.fromBucketArn(this, "Code", bucketArn);

    const handler = new NodejsFunction(this, "Handler", {
      code: Code.fromBucketV2(
        bucket,
        `${prefix}/efs-pre-signed-url-handler-${version}.zip`,
      ),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      description: "EFS Pre-signed URL handler",
      handler: "handler.handler",
      logGroup: new LogGroup(this, "Logs", {
        retention: RetentionDays.TWO_WEEKS,
        ...props.handler?.logGroup,
      }),
      environment: {
        PRE_SHARED_SECRET: props.preSharedSecret,
      },
      memorySize: props.handler?.memorySize ?? 512,
      timeout: props.handler?.timeout ?? Duration.minutes(5),
      vpc: props.vpc,
      filesystem: FileSystem.fromEfsAccessPoint(props.accessPoint, "/mnt/data"),
      reservedConcurrentExecutions:
        props.handler?.reservedConcurrentExecutions ?? 25,
      allowPublicSubnet: props.handler?.allowPublicSubnet ?? false,
    });

    const token = new Secret(handler, "Token", {
      generateSecretString: {
        passwordLength: 128,
      },
    }).secretValue.toString();

    handler.addEnvironment("TOKEN", token);

    const url = handler.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });

    const cachePolicy = new CachePolicy(this, "CachePolicy", {
      queryStringBehavior: CacheQueryStringBehavior.all(),
      headerBehavior: CacheHeaderBehavior.allowList("Authorization"),
    });

    const origin = new FunctionUrlOrigin(url, {
      keepaliveTimeout: Duration.seconds(60),
      customHeaders: {
        token,
      },
    });
    const originProps = {
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [
        {
          function: new CloudFrontFunction(this, "ViewerRequest", {
            code: FunctionCode.fromInline(`
          function handler(event) {
            event.request.headers['x-forwarded-host'] = { value: event.request.headers.host.value };
            return event.request;
          }
        `),
          }),
          eventType: FunctionEventType.VIEWER_REQUEST,
        },
      ],
    };

    if (props.distribution != null) {
      props.distribution.addBehavior(
        props.distributionPathPattern ?? "v1/files*",
        origin,
        originProps,
      );
      this.fileSystemUri = props.distribution.domainName;
    } else {
      const distribution = new Distribution(this, "Distribution", {
        defaultBehavior: {
          origin,
          cachePolicy,
          ...originProps,
        },
        priceClass: PriceClass.PRICE_CLASS_100,
      });
      this.fileSystemUri = distribution.domainName;
    }

    this.preSharedSecret = props.preSharedSecret;
  }

  readonly grantAccess = (handler: Function) => {
    handler.addEnvironment(
      "BEESOLVE_EFS_PRE_SIGNED_URL_SECRET",
      this.preSharedSecret,
    );
    handler.addEnvironment(
      "BEESOLVE_EFS_PRE_SIGNED_URL_FILE_SYSTEM_URI",
      `https://${this.fileSystemUri}`,
    );
  };
}
