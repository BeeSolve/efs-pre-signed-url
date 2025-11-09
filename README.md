# EFS Pre-signed URL

SDK and CDK constructs for EFS Pre-signed URL service.

The service is provided by BeeSolve and can be pruchased at [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-nb2zctqan5no6).

## Installation

```bash
npm i @beesolve/efs-pre-signed-url
```

## Usage

```ts
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { AccessPoint, FileSystem } from "aws-cdk-lib/aws-efs";
import {
  Architecture,
  FileSystem as LambdaFileSystem,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Duration, Environment, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { resolve } from "node:path";

import { EfsPreSignedUrl } from "@beesolve/efs-pre-signed-url/cdk";

export class YourStack extends Stack {
  constructor(scope: Construct, id: string, props: { env: Environment }) {
    super(scope, id, {
      env: props.env,
    });

    const vpc = Vpc.fromLookup(this, "Vpc", {
      isDefault: true,
    });

    const efs = new FileSystem(this, "FileSystem", {
      vpc,
    });

    // Create EfsPreSignedUrl construct
    const efsPreSignedUrl = new EfsPreSignedUrl(this, "EfsPrePignedUrl", {
      accessPoint: new AccessPoint(this, "AccessPoint", {
        fileSystem: efs,
        posixUser: { gid: "1000", uid: "1000" },
        // the presigner only needs read permissions
        createAcl: { ownerGid: "1000", ownerUid: "1000", permissions: "444" },
        path: "/path-to-your-files",
      }),
      // you can provide secret by any other means
      preSharedSecret: new Secret(this, "PreSharedSecret", {
        generateSecretString: {
          passwordLength: 128,
        },
      }).secretValue.toString(),
      vpc,
    });

    // your handler which will use EFS Pre-signed URL
    const handler = new NodejsFunction(this, "Handler", {
      entry: resolve(__dirname, "handler.ts"),
      handler: "handler",
      bundling: {
        target: "es2022",
      },
      memorySize: 256,
      timeout: Duration.seconds(5),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      filesystem: LambdaFileSystem.fromEfsAccessPoint(new AccessPoint(this, "AccessPoint", {
        fileSystem: efs,
        posixUser: { gid: "1000", uid: "1000" },
        // in the below example we want to create file in the EFS so we need write permissions as well
        createAcl: { ownerGid: "1000", ownerUid: "1000", permissions: "755" },
        path: "/path-to-your-files",
      }), "/mnt/data"),
      vpc
    });

    // allows usage of SDK in the handler function
    efsPreSignedUrl.grantAccess(handler);
  }
}
```

Once you've set up the CDK part you can start using our SDK in the handler like this:

```ts
import { writeFileSync } from "node:fs";
import { EfsPreSignedUrlClient } from "@beesolve/efs-pre-signed-url/sdk";

// create EfsPreSignedUrl client
const client = new EfsPreSignedUrlClient({ defaultExpirationInSeconds: 30 });

export const handler = async () => {
  const path = "/mnt/data/test.json";

  writeFileSync(
    path,
    JSON.stringify({
      testFile: true,
      createdAt: new Date(),
    }),
  );

  return {
    body: JSON.stringify({ url: client.toSignedUrl(path) }),
    statusCode: 200,
    headers: { "Content-Type": "text/json" },
  };
};
```

The handler will return pre-signed URL which will serve the file from your EFS.

## Documentation

Further documentation can be found at [marketplace.beesolve.com](https://marketplace.beesolve.com).
