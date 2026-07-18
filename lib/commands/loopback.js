/**
 * Module: commands/loopback
 * Purpose: The single source of truth for the Hub's loopback trust boundary
 *          (NFR-010): an /api/* request is trusted only when its peer is the local
 *          loopback interface. Extracted so the guard is unit-testable.
 *
 * @aitri-trace FR-ID: NFR-010, TC-ID: TC-NFR-010f, TC-LOOP-010h
 */

/**
 * True when a socket remote address is the local loopback (IPv4 127.0.0.1, IPv6
 * ::1, or the IPv4-mapped-IPv6 form). Every other peer is untrusted → 403.
 * @param {string|undefined|null} addr - req.socket.remoteAddress
 * @returns {boolean}
 */
export function isLoopbackAddr(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
