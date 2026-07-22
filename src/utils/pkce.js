import crypto from "crypto";

export function base64URLEncode(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

export function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest();
}

export function generatePKCE() {
    const verifier = base64URLEncode(
        crypto.randomBytes(32)
    );

    const challenge = base64URLEncode(
        sha256(verifier)
    );

    return {
        verifier,
        challenge
    };
}
