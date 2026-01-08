/**
 * Complex number class for acoustic calculations.
 *
 * Ported from Apache Commons Math Complex class usage in WWIDesigner.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Immutable complex number class.
 * Represents a complex number z = re + im*i where i is the imaginary unit.
 */
export class Complex {
  /** Real part */
  public readonly re: number;
  /** Imaginary part */
  public readonly im: number;

  /** Complex zero: 0 + 0i */
  public static readonly ZERO = new Complex(0, 0);
  /** Complex one: 1 + 0i */
  public static readonly ONE = new Complex(1, 0);
  /** Imaginary unit: 0 + 1i */
  public static readonly I = new Complex(0, 1);
  /** Negative one: -1 + 0i */
  public static readonly MINUS_ONE = new Complex(-1, 0);
  /** Infinity representation */
  public static readonly INFINITY = new Complex(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  /** NaN representation */
  public static readonly NaN = new Complex(Number.NaN, Number.NaN);

  /**
   * Create a complex number.
   * @param re Real part
   * @param im Imaginary part (default 0)
   */
  constructor(re: number, im: number = 0) {
    this.re = re;
    this.im = im;
  }

  /**
   * Get the real part.
   * @returns Real part of the complex number
   */
  getReal(): number {
    return this.re;
  }

  /**
   * Get the imaginary part.
   * @returns Imaginary part of the complex number
   */
  getImaginary(): number {
    return this.im;
  }

  /**
   * Check if this complex number is NaN.
   */
  isNaN(): boolean {
    return Number.isNaN(this.re) || Number.isNaN(this.im);
  }

  /**
   * Check if this complex number is infinite.
   */
  isInfinite(): boolean {
    return !this.isNaN() && (!Number.isFinite(this.re) || !Number.isFinite(this.im));
  }

  /**
   * Get the absolute value (magnitude/modulus) of this complex number.
   * |z| = sqrt(re² + im²)
   */
  abs(): number {
    // Use hypot for numerical stability
    return Math.hypot(this.re, this.im);
  }

  /**
   * Get the argument (phase angle) of this complex number.
   * arg(z) = atan2(im, re)
   * @returns Angle in radians, in range (-π, π]
   */
  arg(): number {
    return Math.atan2(this.im, this.re);
  }

  /**
   * Get the complex conjugate.
   * conj(a + bi) = a - bi
   */
  conjugate(): Complex {
    return new Complex(this.re, -this.im);
  }

  /**
   * Negate this complex number.
   * -z = -re - im*i
   */
  negate(): Complex {
    return new Complex(-this.re, -this.im);
  }

  /**
   * Get the reciprocal (multiplicative inverse).
   * 1/z = conj(z) / |z|²
   */
  reciprocal(): Complex {
    const scale = this.re * this.re + this.im * this.im;
    return new Complex(this.re / scale, -this.im / scale);
  }

  /**
   * Add another complex number or real number.
   * (a + bi) + (c + di) = (a+c) + (b+d)i
   */
  add(other: Complex | number): Complex {
    if (typeof other === "number") {
      return new Complex(this.re + other, this.im);
    }
    return new Complex(this.re + other.re, this.im + other.im);
  }

  /**
   * Subtract another complex number or real number.
   * (a + bi) - (c + di) = (a-c) + (b-d)i
   */
  subtract(other: Complex | number): Complex {
    if (typeof other === "number") {
      return new Complex(this.re - other, this.im);
    }
    return new Complex(this.re - other.re, this.im - other.im);
  }

  /**
   * Multiply by another complex number or real number.
   * (a + bi)(c + di) = (ac - bd) + (ad + bc)i
   */
  multiply(other: Complex | number): Complex {
    if (typeof other === "number") {
      return new Complex(this.re * other, this.im * other);
    }
    return new Complex(
      this.re * other.re - this.im * other.im,
      this.re * other.im + this.im * other.re
    );
  }

  /**
   * Divide by another complex number or real number.
   * (a + bi) / (c + di) = ((ac + bd) + (bc - ad)i) / (c² + d²)
   */
  divide(other: Complex | number): Complex {
    if (typeof other === "number") {
      return new Complex(this.re / other, this.im / other);
    }

    const denominator = other.re * other.re + other.im * other.im;
    if (denominator === 0) {
      return Complex.NaN;
    }
    return new Complex(
      (this.re * other.re + this.im * other.im) / denominator,
      (this.im * other.re - this.re * other.im) / denominator
    );
  }

  /**
   * Complex exponential.
   * exp(a + bi) = exp(a) * (cos(b) + i*sin(b))
   */
  exp(): Complex {
    const expRe = Math.exp(this.re);
    return new Complex(expRe * Math.cos(this.im), expRe * Math.sin(this.im));
  }

  /**
   * Complex natural logarithm.
   * log(z) = log(|z|) + i*arg(z)
   */
  log(): Complex {
    return new Complex(Math.log(this.abs()), this.arg());
  }

  /**
   * Complex square root.
   * Uses the principal branch.
   */
  sqrt(): Complex {
    if (this.re === 0 && this.im === 0) {
      return Complex.ZERO;
    }

    const t = Math.sqrt((Math.abs(this.re) + this.abs()) / 2);
    if (this.re >= 0) {
      return new Complex(t, this.im / (2 * t));
    } else {
      return new Complex(
        Math.abs(this.im) / (2 * t),
        this.im >= 0 ? t : -t
      );
    }
  }

  /**
   * Complex power.
   * z^w = exp(w * log(z))
   */
  pow(exponent: Complex | number): Complex {
    if (typeof exponent === "number") {
      if (exponent === 0) {
        return Complex.ONE;
      }
      if (this.re === 0 && this.im === 0) {
        return Complex.ZERO;
      }
      return this.log().multiply(exponent).exp();
    }
    if (this.re === 0 && this.im === 0) {
      return Complex.ZERO;
    }
    return this.log().multiply(exponent).exp();
  }

  /**
   * Complex sine.
   * sin(z) = (exp(iz) - exp(-iz)) / (2i)
   */
  sin(): Complex {
    return new Complex(
      Math.sin(this.re) * Math.cosh(this.im),
      Math.cos(this.re) * Math.sinh(this.im)
    );
  }

  /**
   * Complex cosine.
   * cos(z) = (exp(iz) + exp(-iz)) / 2
   */
  cos(): Complex {
    return new Complex(
      Math.cos(this.re) * Math.cosh(this.im),
      -Math.sin(this.re) * Math.sinh(this.im)
    );
  }

  /**
   * Complex tangent.
   * tan(z) = sin(z) / cos(z)
   */
  tan(): Complex {
    return this.sin().divide(this.cos());
  }

  /**
   * Complex hyperbolic sine.
   * sinh(z) = (exp(z) - exp(-z)) / 2
   */
  sinh(): Complex {
    return new Complex(
      Math.sinh(this.re) * Math.cos(this.im),
      Math.cosh(this.re) * Math.sin(this.im)
    );
  }

  /**
   * Complex hyperbolic cosine.
   * cosh(z) = (exp(z) + exp(-z)) / 2
   */
  cosh(): Complex {
    return new Complex(
      Math.cosh(this.re) * Math.cos(this.im),
      Math.sinh(this.re) * Math.sin(this.im)
    );
  }

  /**
   * Complex hyperbolic tangent.
   * tanh(z) = sinh(z) / cosh(z)
   */
  tanh(): Complex {
    return this.sinh().divide(this.cosh());
  }

  /**
   * Complex inverse sine (arc sine).
   * asin(z) = -i * log(iz + sqrt(1 - z²))
   */
  asin(): Complex {
    const iz = Complex.I.multiply(this);
    const sqrt = Complex.ONE.subtract(this.multiply(this)).sqrt();
    return Complex.I.negate().multiply(iz.add(sqrt).log());
  }

  /**
   * Complex inverse cosine (arc cosine).
   * acos(z) = -i * log(z + sqrt(z² - 1))
   */
  acos(): Complex {
    const sqrt = this.multiply(this).subtract(1).sqrt();
    return Complex.I.negate().multiply(this.add(sqrt).log());
  }

  /**
   * Complex inverse tangent (arc tangent).
   * atan(z) = (i/2) * log((1 - iz) / (1 + iz))
   */
  atan(): Complex {
    const iz = Complex.I.multiply(this);
    const ratio = Complex.ONE.subtract(iz).divide(Complex.ONE.add(iz));
    return Complex.I.divide(2).multiply(ratio.log());
  }

  /**
   * Check equality with another complex number.
   * @param other Complex number to compare
   * @param tolerance Optional tolerance for comparison (default: 0)
   */
  equals(other: Complex, tolerance: number = 0): boolean {
    if (tolerance === 0) {
      return this.re === other.re && this.im === other.im;
    }
    return (
      Math.abs(this.re - other.re) <= tolerance &&
      Math.abs(this.im - other.im) <= tolerance
    );
  }

  /**
   * Convert to string representation.
   */
  toString(): string {
    if (this.im === 0) {
      return `${this.re}`;
    }
    if (this.re === 0) {
      return `${this.im}i`;
    }
    if (this.im < 0) {
      return `${this.re} - ${-this.im}i`;
    }
    return `${this.re} + ${this.im}i`;
  }

  /**
   * Create a complex number from polar form.
   * @param r Magnitude (radius)
   * @param theta Angle in radians
   */
  static fromPolar(r: number, theta: number): Complex {
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
  }

  /**
   * Create a copy of a complex number (for compatibility with Java code).
   * Since Complex is immutable, this just returns a new instance with same values.
   */
  static copy(z: Complex): Complex {
    return new Complex(z.re, z.im);
  }
}
