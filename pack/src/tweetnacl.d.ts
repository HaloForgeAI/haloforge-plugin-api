declare module "tweetnacl" {
  interface SignKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  interface SignNamespace {
    detached(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
    keyPair: {
      fromSeed(seed: Uint8Array): SignKeyPair;
    };
  }

  const nacl: {
    sign: SignNamespace;
  };

  export default nacl;
}
