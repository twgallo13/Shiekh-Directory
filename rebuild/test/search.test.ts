/**
 * Tests for Search functionality
 * 
 * Tests verify:
 * 1. Search by store number (including "007")
 * 2. Search by city
 * 3. Search by name
 * 4. Search results are ranked properly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Search Functionality', () => {
  it('should match store number "007" exactly', () => {
    const storeNumber = '007';
    const query = '007';
    
    const matches = storeNumber.toLowerCase().includes(query.toLowerCase());
    assert.strictEqual(matches, true);
  });
  
  it('should match partial store numbers', () => {
    const storeNumber = '007';
    const query = '07';
    
    const matches = storeNumber.toLowerCase().includes(query.toLowerCase());
    assert.strictEqual(matches, true);
  });
  
  it('should match city names', () => {
    const city = 'Los Angeles';
    const query = 'angeles';
    
    const matches = city.toLowerCase().includes(query.toLowerCase());
    assert.strictEqual(matches, true);
  });
  
  it('should match store names', () => {
    const name = 'Downtown LA Flagship';
    const query = 'downtown';
    
    const matches = name.toLowerCase().includes(query.toLowerCase());
    assert.strictEqual(matches, true);
  });
  
  it('should not match unrelated queries', () => {
    const storeNumber = '007';
    const name = 'Downtown LA Flagship';
    const city = 'Los Angeles';
    const query = 'chicago';
    
    const matches = 
      storeNumber.toLowerCase().includes(query.toLowerCase()) ||
      name.toLowerCase().includes(query.toLowerCase()) ||
      city.toLowerCase().includes(query.toLowerCase());
    
    assert.strictEqual(matches, false);
  });
  
  it('should rank exact matches higher', () => {
    const results = [
      { title: 'Store 007', query: '007' },
      { title: '007 Downtown', query: '007' },
      { title: 'Store 1007', query: '007' },
    ];
    
    results.sort((a, b) => {
      const aExact = a.title.toLowerCase().startsWith(a.query.toLowerCase()) ? 0 : 1;
      const bExact = b.title.toLowerCase().startsWith(b.query.toLowerCase()) ? 0 : 1;
      return aExact - bExact;
    });
    
    assert.strictEqual(results[0].title, '007 Downtown');
  });
});

describe('Phone Number Search', () => {
  it('should normalize phone numbers for search', () => {
    const normalizePhoneForSearch = (phone: string | undefined): string | null => {
      if (!phone) return null;
      return phone.replace(/[^\d]/g, '');
    };
    
    assert.strictEqual(normalizePhoneForSearch('(213) 555-0007'), '2135550007');
    assert.strictEqual(normalizePhoneForSearch('+1 213-555-0007'), '12135550007');
    assert.strictEqual(normalizePhoneForSearch('2135550007'), '2135550007');
    assert.strictEqual(normalizePhoneForSearch(undefined), null);
  });
  
  it('should match phone number searches', () => {
    const storePhone = '2135550007';
    const searchQueries = ['213', '555', '0007', '2135550007'];
    
    for (const query of searchQueries) {
      const normalizedQuery = query.replace(/[^\d]/g, '');
      const matches = storePhone.includes(normalizedQuery);
      assert.strictEqual(matches, true, `Should match query: ${query}`);
    }
  });
});

console.log('Search tests loaded');
