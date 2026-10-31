import type { Address } from '../../src/types';

export function formatAddress(address: Address): string {
  const parts = [address.street];
  
  if (address.suite) {
    parts.push(address.suite);
  }
  
  parts.push(`${address.city}, ${address.state} ${address.zip}`);
  
  if (address.country && address.country !== 'US') {
    parts.push(address.country);
  }
  
  return parts.join(', ');
}

export function getMapsUrl(address: Address): string {
  const query = encodeURIComponent(formatAddress(address));
  return `https://maps.google.com/?q=${query}`;
}
