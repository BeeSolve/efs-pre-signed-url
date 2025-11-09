import { createHmac } from "crypto";

/**
 * Creates HMAC signer.
 */
export const toHmacSignature = (config: { preSharedKey: string }) => {
  function sign(value: string): string {
    return createHmac("SHA256", Buffer.from(config.preSharedKey, "hex"))
      .update(value)
      .digest("hex");
  }

  function isValidSignature(props: {
    value: string;
    signature: string;
  }): boolean {
    return sign(props.value) === props.signature;
  }

  return {
    /**
     * Signs provided value with HMAC signature.
     */
    sign,
    /**
     * Verifies if the signature is one of provided value.
     */
    isValidSignature,
  };
};
