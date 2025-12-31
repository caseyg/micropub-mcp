/**
 * Tests for PKCE utilities
 */

import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../src/lib/pkce";

describe("PKCE utilities", () => {
  describe("generateCodeVerifier", () => {
    it("should generate a 43-character string", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(43);
    });

    it("should only contain base64url characters", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique values", () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe("generateCodeChallenge", () => {
    it("should generate a 43-character string from a verifier", async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toHaveLength(43);
    });

    it("should only contain base64url characters", async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate the same challenge for the same verifier", async () => {
      const verifier = "test-verifier-12345678901234567890123";
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it("should generate different challenges for different verifiers", async () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = await generateCodeChallenge(verifier1);
      const challenge2 = await generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    it("should produce a known value for a known input", async () => {
      // This is a known test vector
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = await generateCodeChallenge(verifier);
      // SHA-256 of the verifier, base64url encoded
      expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    });
  });

  describe("generateState", () => {
    it("should generate a 22-character string", () => {
      const state = generateState();
      expect(state).toHaveLength(22);
    });

    it("should only contain base64url characters", () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique values", () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });
  });
});
