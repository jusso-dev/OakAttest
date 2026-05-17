const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

export function normalizeAbn(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function isValidAbn(value: string): boolean {
  const abn = normalizeAbn(value);
  if (!/^\d{11}$/.test(abn)) return false;

  const digits = abn.split('').map((digit) => Number(digit));
  digits[0] -= 1;

  const sum = digits.reduce((total, digit, index) => total + digit * WEIGHTS[index], 0);
  return sum % 89 === 0;
}
