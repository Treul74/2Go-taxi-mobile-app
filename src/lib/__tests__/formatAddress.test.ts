/**
 * Tests for formatDisplayAddress utility
 * 
 * To run these tests:
 * npm test formatAddress
 * or
 * yarn test formatAddress
 */

import { formatDisplayAddress, formatShortAddress, extractPlusCode } from '../formatAddress';

describe('formatDisplayAddress', () => {
  describe('Specific place names (Priority 1)', () => {
    it('should show specific place name from searched location', () => {
      expect(formatDisplayAddress('Royal Kutachika Lodge, Zambezi, Zambia')).toBe('Royal Kutachika Lodge');
    });

    it('should show hotel name', () => {
      expect(formatDisplayAddress('Radisson Blu Hotel, Lusaka, Zambia')).toBe('Radisson Blu Hotel');
    });

    it('should show mall name', () => {
      expect(formatDisplayAddress('Manda Hill Mall, Lusaka')).toBe('Manda Hill Mall');
    });

    it('should show street name', () => {
      expect(formatDisplayAddress('Cairo Road, Lusaka, Zambia')).toBe('Cairo Road');
    });

    it('should show restaurant name', () => {
      expect(formatDisplayAddress('Ocean Basket Restaurant, Kitwe')).toBe('Ocean Basket Restaurant');
    });

    it('should show street address with number', () => {
      expect(formatDisplayAddress('123 Independence Avenue, Lusaka')).toBe('123 Independence Avenue');
    });
  });

  describe('Generic locations with Plus Code (Priority 2)', () => {
    it('should remove Plus Code when city and country exist', () => {
      expect(formatDisplayAddress('F432+J4C, Zambezi, Zambia')).toBe('Zambezi, Zambia');
    });

    it('should remove Plus Code when only city exists', () => {
      expect(formatDisplayAddress('8FVC9G8F+5V, Lusaka')).toBe('Lusaka');
    });

    it('should remove Plus Code with city and province', () => {
      expect(formatDisplayAddress('MQRG+2H, Kitwe, Copperbelt')).toBe('Kitwe, Copperbelt');
    });
  });

  describe('Plus Code only - map pick without name (Priority 3)', () => {
    it('should keep Plus Code when it is the only identifier', () => {
      expect(formatDisplayAddress('F432+J4C')).toBe('F432+J4C');
    });

    it('should keep Plus Code with long format', () => {
      expect(formatDisplayAddress('8FVC9G8F+5V')).toBe('8FVC9G8F+5V');
    });

    it('should show Plus Code when picked on map without specific name', () => {
      expect(formatDisplayAddress('F432+J4C')).toBe('F432+J4C');
    });
  });

  describe('No Plus Code', () => {
    it('should return address unchanged when no Plus Code', () => {
      expect(formatDisplayAddress('Cairo Road, Lusaka')).toBe('Cairo Road, Lusaka');
    });

    it('should return single location name unchanged', () => {
      expect(formatDisplayAddress('Manda Hill Mall')).toBe('Manda Hill Mall');
    });

    it('should return full address unchanged', () => {
      expect(formatDisplayAddress('123 Independence Avenue, Lusaka, Zambia')).toBe(
        '123 Independence Avenue, Lusaka, Zambia'
      );
    });
  });

  describe('Edge cases and cleanup', () => {
    it('should clean up multiple commas', () => {
      expect(formatDisplayAddress('F432+J4C,,,Lusaka')).toBe('Lusaka');
    });

    it('should clean up extra spaces', () => {
      expect(formatDisplayAddress('  F432+J4C  ,  Lusaka  ')).toBe('Lusaka');
    });

    it('should handle empty string', () => {
      expect(formatDisplayAddress('')).toBe('');
    });

    it('should handle whitespace only', () => {
      expect(formatDisplayAddress('   ')).toBe('');
    });

    it('should remove leading comma', () => {
      expect(formatDisplayAddress(', Lusaka, Zambia')).toBe('Lusaka, Zambia');
    });

    it('should remove trailing comma', () => {
      expect(formatDisplayAddress('Lusaka, Zambia,')).toBe('Lusaka, Zambia');
    });

    it('should clean up multiple spaces between words', () => {
      expect(formatDisplayAddress('Cairo    Road,   Lusaka')).toBe('Cairo Road, Lusaka');
    });
  });

  describe('Multiple Plus Codes', () => {
    it('should remove all Plus Codes when place name exists', () => {
      expect(formatDisplayAddress('F432+J4C, 8FVC9G8F+5V, Lusaka')).toBe('Lusaka');
    });
  });

  describe('Real-world Zambian addresses', () => {
    it('should show specific lodge name', () => {
      expect(formatDisplayAddress('Royal Kutachika Lodge, Zambezi, Zambia')).toBe('Royal Kutachika Lodge');
    });

    it('should format generic Lusaka address', () => {
      expect(formatDisplayAddress('8FVC9G8F+5V, Lusaka, Zambia')).toBe('Lusaka, Zambia');
    });

    it('should format Livingstone address correctly', () => {
      expect(formatDisplayAddress('F432+J4C, Livingstone, Southern Province')).toBe(
        'Livingstone, Southern Province'
      );
    });

    it('should show Victoria Falls Hotel specifically', () => {
      expect(formatDisplayAddress('Victoria Falls Hotel, Livingstone')).toBe('Victoria Falls Hotel');
    });

    it('should show Levy Mall specifically', () => {
      expect(formatDisplayAddress('Levy Junction Mall, Lusaka')).toBe('Levy Junction Mall');
    });
  });
});

describe('extractPlusCode', () => {
  it('should extract Plus Code from full address', () => {
    expect(extractPlusCode('F432+J4C, Zambezi, Zambia')).toBe('F432+J4C');
  });

  it('should extract Plus Code from address with specific place', () => {
    expect(extractPlusCode('Royal Kutachika Lodge, F432+J4C, Zambezi')).toBe('F432+J4C');
  });

  it('should return empty string when no Plus Code', () => {
    expect(extractPlusCode('Lusaka, Zambia')).toBe('');
  });

  it('should handle Plus Code only', () => {
    expect(extractPlusCode('8FVC9G8F+5V')).toBe('8FVC9G8F+5V');
  });
});

describe('formatShortAddress', () => {
  it('should return first part of address', () => {
    expect(formatShortAddress('Zambezi, Zambia')).toBe('Zambezi');
  });

  it('should return specific place name', () => {
    expect(formatShortAddress('Royal Kutachika Lodge, Zambezi, Zambia')).toBe('Royal Kutachika Lodge');
  });

  it('should remove Plus Code and return first part', () => {
    expect(formatShortAddress('F432+J4C, Zambezi, Zambia')).toBe('Zambezi');
  });

  it('should return single word address', () => {
    expect(formatShortAddress('Lusaka')).toBe('Lusaka');
  });

  it('should handle Plus Code only', () => {
    expect(formatShortAddress('F432+J4C')).toBe('F432+J4C');
  });

  it('should handle empty string', () => {
    expect(formatShortAddress('')).toBe('');
  });

  it('should return full place name if no comma', () => {
    expect(formatShortAddress('Manda Hill Mall')).toBe('Manda Hill Mall');
  });
});

