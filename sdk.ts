import * as v from "valibot";
import { toHmacSignature } from "./src/hmac";

const envSchema = v.object({
  BEESOLVE_EFS_PRE_SIGNED_URL_SECRET: v.string(),
  BEESOLVE_EFS_PRE_SIGNED_URL_FILE_SYSTEM_URI: v.string(),
});
const env = v.parse(envSchema, process.env);

export class EfsPreSignedUrlClient {
  private fileSystemUri: URL;
  private readonly defaultExpirationInSeconds: number;
  private readonly sign: (value: string) => string;

  constructor(
    private readonly props: {
      /**
       * @default 60
       */
      readonly defaultExpirationInSeconds: number;
    },
  ) {
    this.fileSystemUri = new URL(
      env.BEESOLVE_EFS_PRE_SIGNED_URL_FILE_SYSTEM_URI,
    );
    this.defaultExpirationInSeconds = props.defaultExpirationInSeconds ?? 60;
    this.sign = toHmacSignature({
      preSharedKey: env.BEESOLVE_EFS_PRE_SIGNED_URL_SECRET,
    }).sign;
  }

  readonly toSignedUrl = (path: string, expirationInSeconds?: number) => {
    const expiresAt = new Date();
    expiresAt.setUTCSeconds(
      expiresAt.getUTCSeconds() +
        (expirationInSeconds ?? this.defaultExpirationInSeconds),
    );

    const url = new URL(this.fileSystemUri);
    url.searchParams.append("path", Buffer.from(path).toString("base64url"));
    url.searchParams.append("expiresAt", expiresAt.getTime().toString());
    url.searchParams.append("signature", this.sign(url.toString()));

    return url.toString();
  };
}
