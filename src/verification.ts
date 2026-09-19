import type { ToleranceMode } from './engine'

/**
 * Problems whose answers are known before Longhand is asked.
 *
 * One wrong answer in front of a practising engineer ends this project, so the
 * suite exists twice over: `verification.test.ts` runs it on every commit, and
 * /verification runs it in the reader's own browser, live, so the claim is
 * checkable rather than asserted.
 *
 * Every expected value here was worked out independently of this codebase —
 * from the closed-form result, or from a defining conversion — and the number
 * is written into the sheet beside a note saying where it came from. So each
 * case is an ordinary Longhand sheet that ends in a check, and "verified"
 * means what it says: the sheet ran without errors and every check in it held.
 *
 * Nothing here cites a textbook page. A closed-form formula and an exact SI
 * definition can be confirmed by any reader; a page reference they cannot see
 * would be decoration.
 */

export type Field =
  | 'Structures'
  | 'Fluids'
  | 'Thermal'
  | 'Units'
  | 'Uncertainty'
  | 'Mathematics'

export interface Case {
  id: string
  title: string
  field: Field
  /** What the answer is measured against, in one line, for the page. */
  against: string
  source: string
  /** Cases that need worst-case combination rather than the default. */
  mode?: ToleranceMode
  /**
   * The one thing an in-sheet check cannot reach: a propagated ± is not a
   * value in scope, so for the uncertainty cases the printed line itself is
   * what gets compared.
   */
  mustRead?: { of: string; contains: string }[]
}

export const CASES: Case[] = [
  {
    id: 'udl-moment',
    title: 'Simply supported beam under a uniform load',
    field: 'Structures',
    against: 'The closed form M = wL²/8 at midspan',
    source: `# Simply supported beam, uniform load

w = 12 kN/m
L = 6 m
M = w*L^2/8

// Closed form for a simply supported span: M_max = wL^2/8.
// 12 x 6^2 / 8 = 54, by hand.
M_closed = 54 kN*m
abs(M - M_closed)/M_closed <= 1e-12
`,
  },
  {
    id: 'udl-deflection',
    title: 'Midspan deflection, two algebraically equal routes',
    field: 'Structures',
    against: '5wL⁴/384EI against (5/48)ML²/EI, which are the same expression rearranged',
    source: `# Midspan deflection of a uniformly loaded span

w = 12 kN/m
L = 6 m
E = 210 GPa
I = 8356e4 mm^4

d_1 = 5*w*L^4/(384*E*I) -> mm
M = w*L^2/8
d_2 = (5/48)*M*L^2/(E*I) -> mm

// The same deflection by two routes, one in terms of the load and one in
// terms of the moment. They must agree, and they exercise different unit
// algebra: kN/m x m^4 / (GPa x mm^4) against kN*m x m^2 / (GPa x mm^4).
abs(d_1 - d_2)/d_1 <= 1e-9

// Worked in SI by hand: 5 x 12e3 x 1296 / (384 x 210e9 x 8.356e-5) = 0.01154 m
d_closed = 11.54004 mm
abs(d_1 - d_closed)/d_closed <= 1e-5
`,
  },
  {
    id: 'cantilever',
    title: 'Cantilever with a point load at the tip',
    field: 'Structures',
    against: 'M = PL and δ = PL³/3EI',
    source: `# Cantilever, point load at the tip

P = 15 kN
L = 2.5 m
E = 210 GPa
I = 2772e4 mm^4

M = P*L
d = P*L^3/(3*E*I) -> mm

// M = PL = 15 x 2.5 = 37.5 kN*m
M_closed = 37.5 kN*m
abs(M - M_closed)/M_closed <= 1e-12

// d = PL^3/3EI = 15e3 x 15.625 / (3 x 210e9 x 2.772e-5) = 0.013421 m
d_closed = 13.42077 mm
abs(d - d_closed)/d_closed <= 1e-5
`,
  },
  {
    id: 'section-modulus',
    title: 'Rectangular section modulus and bending stress',
    field: 'Structures',
    against: 'W = bh²/6, σ = M/W',
    source: `# Rectangular section in bending

b = 300 mm
h = 500 mm
M_Ed = 250 kN*m

W = b*h^2/6
sigma = M_Ed/W -> MPa

// W = 300 x 500^2 / 6 = 1.25e7 mm^3
W_closed = 1.25e7 mm^3
abs(W - W_closed)/W_closed <= 1e-12

// sigma = 250e3 / 0.0125 = 20e6 Pa
sigma_closed = 20 MPa
abs(sigma - sigma_closed)/sigma_closed <= 1e-12
`,
  },
  {
    id: 'circle',
    title: 'Area and second moment of a circle',
    field: 'Mathematics',
    against: 'A = πd²/4 and I = πd⁴/64',
    source: `# Properties of a 20 mm bar

d = 20 mm
A = pi*d^2/4 -> mm^2
I = pi*d^4/64 -> mm^4

// pi x 400 / 4 = 314.159265 mm^2
A_closed = 314.159265 mm^2
abs(A - A_closed)/A_closed <= 1e-8

// pi x 160000 / 64 = 7853.98163 mm^4
I_closed = 7853.98163 mm^4
abs(I - I_closed)/I_closed <= 1e-8
`,
  },
  {
    id: 'euler',
    title: 'Euler buckling load',
    field: 'Structures',
    against: 'P_cr = π²EI/L²',
    source: `# Euler buckling of a pin-ended column

E = 210 GPa
I = 2772e4 mm^4
L = 4 m

P_cr = pi^2*E*I/L^2 -> kN

// pi^2 x 210e9 x 2.772e-5 / 16 = 3.5908e6 N
P_closed = 3590.809 kN
abs(P_cr - P_closed)/P_closed <= 1e-6
`,
  },
  {
    id: 'reactions',
    title: 'Reactions under an off-centre point load',
    field: 'Structures',
    against: 'R_A = Pb/L, R_B = Pa/L, and the two must sum to P',
    source: `# Simply supported span, load 2 m from the left support

P = 40 kN
a = 2 m
b = 4 m
L = a + b

R_A = P*b/L
R_B = P*a/L

// Statics: moments about B give R_A = Pb/L = 40 x 4 / 6
R_A_closed = 26.66667 kN
abs(R_A - R_A_closed)/R_A_closed <= 1e-5

// Vertical equilibrium is the independent check: the reactions carry the load
abs(R_A + R_B - P)/P <= 1e-12
`,
  },
  {
    id: 'principal-stress',
    title: 'Principal stresses from a plane stress state',
    field: 'Structures',
    against: 'σ₁,₂ = (σx+σy)/2 ± √(((σx−σy)/2)² + τ²), and the invariant σ₁+σ₂ = σx+σy',
    source: `# Principal stresses

s_x = 80 MPa
s_y = 20 MPa
tau = 30 MPa

c = (s_x + s_y)/2
r = sqrt(((s_x - s_y)/2)^2 + tau^2)
s_1 = c + r -> MPa
s_2 = c - r -> MPa

// (80+20)/2 + sqrt(30^2 + 30^2) = 50 + 42.426407
s_1_closed = 92.426407 MPa
abs(s_1 - s_1_closed)/s_1_closed <= 1e-7

// The first stress invariant does not depend on the rotation of the axes
abs(s_1 + s_2 - (s_x + s_y))/(s_x + s_y) <= 1e-12
`,
  },
  {
    id: 'heron',
    title: 'Heron formula against base times height',
    field: 'Mathematics',
    against: 'A 3-4-5 triangle is right-angled, so Heron must agree with ½bh',
    source: `# Area of a 3-4-5 triangle, two ways

a = 3 m
b = 4 m
c = 5 m

s = (a + b + c)/2
A_heron = sqrt(s*(s - a)*(s - b)*(s - c)) -> m^2

// 3-4-5 is a right triangle, so the area is also half the legs
A_simple = a*b/2 -> m^2
abs(A_heron - A_simple)/A_simple <= 1e-12

// and both are 6 m^2
A_closed = 6 m^2
abs(A_heron - A_closed)/A_closed <= 1e-12
`,
  },
  {
    id: 'inch',
    title: 'The inch is defined, not measured',
    field: 'Units',
    against: 'The international yard and pound agreement: 1 inch = 25.4 mm exactly',
    source: `# An exact conversion

d = 1 inch -> mm

// Defined exactly since 1959: 25.4 mm, no rounding involved
d_defined = 25.4 mm
abs(d - d_defined)/d_defined <= 1e-15
`,
  },
  {
    id: 'pound-force',
    title: 'Pound-force from its definition',
    field: 'Units',
    against: '1 lbf = 0.45359237 kg × 9.80665 m/s², both defined exactly',
    source: `# A force defined by two exact numbers

F = 1 lbf -> N

// The avoirdupois pound is 0.45359237 kg exactly and standard gravity is
// 9.80665 m/s^2 exactly, so the product is exact too
m_lb = 0.45359237 kg
g_n = 9.80665 m/s^2
F_defined = m_lb*g_n -> N

abs(F - F_defined)/F_defined <= 1e-12
`,
  },
  {
    id: 'pressure',
    title: 'Bar and standard atmosphere',
    field: 'Units',
    against: '1 bar = 100 kPa and 1 atm = 101.325 kPa, both exact by definition',
    source: `# Two defined pressures

p_bar = 1 bar -> kPa
p_atm = 1 atm -> kPa

p_bar_defined = 100 kPa
abs(p_bar - p_bar_defined)/p_bar_defined <= 1e-12

p_atm_defined = 101.325 kPa
abs(p_atm - p_atm_defined)/p_atm_defined <= 1e-12
`,
  },
  {
    id: 'ksi',
    title: 'ksi into MPa',
    field: 'Units',
    against: '1 ksi = 1000 lbf/in², which follows from the two exact definitions above',
    source: `# The conversion behind every American steel grade

s = 1 ksi -> MPa

// 1000 x 4.4482216152605 N / (0.0254 m)^2 = 6.894757293 MPa
s_defined = 6.894757293 MPa
abs(s - s_defined)/s_defined <= 1e-9
`,
  },
  {
    id: 'moment-energy',
    title: 'A moment is not an energy',
    field: 'Units',
    against: 'kN·m and kJ have the same dimensions, so the number must not change — only the name',
    source: `# The conversion that must not happen by itself

M = 250 kN*m
E = M -> kJ

// Dimensionally identical, which is exactly why a moment must be left as the
// engineer wrote it: a bending moment printed as 250 kJ is not wrong, it is
// unreadable.
E_closed = 250 kJ
abs(E - E_closed)/E_closed <= 1e-12
`,
  },
  {
    id: 'molar-volume',
    title: 'Molar volume of an ideal gas',
    field: 'Thermal',
    against: 'V = nRT/p at 273.15 K and 101.325 kPa, the standard molar volume 22.414 L/mol',
    source: `# One mole at standard temperature and pressure

R = 8.314462618 J/(mol*K)
T = 273.15 K
p = 101325 Pa
n = 1 mol

V = n*R*T/p -> L

// 8.314462618 x 273.15 / 101325 = 0.022413970 m^3
V_closed = 22.41397 L
abs(V - V_closed)/V_closed <= 1e-6
`,
  },
  {
    id: 'u-value',
    title: 'Thermal transmittance of a layered wall',
    field: 'Thermal',
    against: 'Resistances in series add, and U = 1/ΣR',
    source: `# A wall build-up

h_i = 7.7 W/(m^2*K)
t = 200 mm
k = 0.035 W/(m*K)
h_e = 25 W/(m^2*K)

R_tot = 1/h_i + t/k + 1/h_e
U = 1/R_tot -> W/m^2/K

// 0.12987 + 5.71429 + 0.04 = 5.88416 m^2K/W, so U = 0.169948
U_closed = 0.1699479 W/m^2/K
abs(U - U_closed)/U_closed <= 1e-6
`,
  },
  {
    id: 'darcy-weisbach',
    title: 'Head loss in a pipe',
    field: 'Fluids',
    against: 'h_f = f (L/D) v²/2g',
    source: `# Friction head loss over a straight run

f = 0.02
L = 50 m
D = 100 mm
v = 2 m/s
g = 9.80665 m/s^2

h_f = f*(L/D)*v^2/(2*g) -> m

// 0.02 x 500 x 4 / 19.6133 = 2.039432 m
h_closed = 2.039432 m
abs(h_f - h_closed)/h_closed <= 1e-6
`,
  },
  {
    id: 'colebrook',
    title: 'Colebrook solved implicitly against an explicit approximation',
    field: 'Fluids',
    against: 'The Swamee–Jain explicit formula, which is quoted as being within a few per cent of Colebrook',
    source: `# Friction factor, solved rather than approximated

Re_D = 1e5
rr = 0.001
f = 0.02

lhs = 1/sqrt(f)
rhs = -2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f)))

// Colebrook has f on both sides, so it is solved rather than evaluated
f_colebrook = solve lhs = rhs for f

// Swamee-Jain is the explicit fit to the same curve
f_sj = 0.25/(log10(rr/3.7 + 5.74/Re_D^0.9))^2

// The fit is quoted as being within a few per cent over this range
abs(f_colebrook - f_sj)/f_sj <= 0.02

// And the solved value must actually satisfy the equation it was solved from
f = f_colebrook
residual = abs(1/sqrt(f) - (-2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f)))))*sqrt(f)
residual <= 1e-4
`,
  },
  {
    id: 'interpolation',
    title: 'Interpolation at a midpoint',
    field: 'Mathematics',
    against: 'Halfway along a straight line is the mean of its ends',
    source: `# Reading between two rows of a table

table props
  x      | y
  0 mm   | 10 MPa
  100 mm | 30 MPa
end

y_mid = interp(50 mm, props.x, props.y) -> MPa

// Linear between the rows, so the midpoint is the average of 10 and 30
y_closed = 20 MPa
abs(y_mid - y_closed)/y_closed <= 1e-12

// and the ends must come back exactly
abs(interp(0 mm, props.x, props.y) - 10 MPa)/(10 MPa) <= 1e-12
abs(interp(100 mm, props.x, props.y) - 30 MPa)/(30 MPa) <= 1e-12
`,
  },
  {
    id: 'solve-inverse',
    title: 'Solving backwards through an intermediate step',
    field: 'Structures',
    against: 'Rearranging σ = 6M/bh² by hand gives b = 6M/σh²',
    source: `# What width would exactly reach the limit?

h = 500 mm
b = 300 mm
M_Ed = 250 kN*m
f_y = 30 MPa

W = b*h^2/6
sigma = M_Ed/W

// sigma depends on b two steps up the chain, not directly
b_req = solve sigma = f_y for b

// By hand: b = 6M/(sigma h^2) = 6 x 250e3 / (30e6 x 0.25) = 0.200 m
b_closed = 6*M_Ed/(f_y*h^2) -> mm
abs(b_req - b_closed)/b_closed <= 1e-4

b_hand = 200 mm
abs(b_closed - b_hand)/b_hand <= 1e-12
`,
  },
  {
    id: 'rounding',
    title: 'Rounding up to a size you can order',
    field: 'Units',
    against: 'Arithmetic: 287.4 rounded up to the next multiple of 10 is 290, and the sheet below must use it',
    source: `# A required width, rounded to stock

b_calc = 287.4 mm
b = b_calc -> ceil 10 mm

b_closed = 290 mm
abs(b - b_closed)/b_closed <= 1e-12

// The rounded value is the one the rest of the sheet uses
h = 500 mm
W = b*h^2/6

// 290 x 500^2 / 6 = 1.2083333e7 mm^3 — not 287.4 x 500^2 / 6 = 1.1975e7
W_closed = 1.2083333e7 mm^3
abs(W - W_closed)/W_closed <= 1e-6
`,
  },
  {
    id: 'range',
    title: 'A range, element by element',
    field: 'Mathematics',
    against: 'An arithmetic series: the sum of 1 to 10 is n(n+1)/2 = 55',
    source: `# Ten load cases at once

i = 1..10
w = i*10 kN/m

total = sum(w)

// Sum of 1..10 is 10 x 11 / 2 = 55, so the total is 550 kN/m
total_closed = 550 kN/m
abs(total - total_closed)/total_closed <= 1e-12

// and the range includes its last value
n = count(i)
abs(n - 10) <= 1e-12
`,
  },
  {
    id: 'quadrature',
    title: 'Tolerances combined in quadrature',
    field: 'Uncertainty',
    against: 'For a product, the relative uncertainties add in quadrature: (σz/z)² = (σx/x)² + (σy/y)²',
    source: `# Two measurements multiplied

x = 300 mm +- 2 mm
y = 50 mm +- 0.3 mm

z = x*y -> mm^2

// The value itself first: 300 x 50 = 15000 mm^2
z_closed = 15000 mm^2
abs(z - z_closed)/z_closed <= 1e-12

// By hand: 15000 x sqrt((2/300)^2 + (0.3/50)^2) = 15000 x 0.0089691 = 134.54 mm^2.
// The propagated uncertainty is not a value the sheet can reach, so it is
// pinned against the printed line instead — see mustRead below.
s_closed = 134.5362 mm^2
`,
    mustRead: [{ of: 'z', contains: '± 134.5 mm^2' }],
  },
  {
    id: 'worst-case',
    title: 'Tolerances combined at worst case',
    field: 'Uncertainty',
    against: 'For a product at worst case the relative uncertainties add directly: σz/z = σx/x + σy/y',
    source: `# The same two measurements, worst case

x = 300 mm +- 2 mm
y = 50 mm +- 0.3 mm

z = x*y -> mm^2

z_closed = 15000 mm^2
abs(z - z_closed)/z_closed <= 1e-12

// By hand: 15000 x (2/300 + 0.3/50) = 15000 x 0.012667 = 190 mm^2
s_closed = 190 mm^2
`,
    mode: 'worst',
    mustRead: [{ of: 'z', contains: '± 190 mm^2' }],
  },
  {
    id: 'temperature-difference',
    title: 'A temperature difference is not a temperature',
    field: 'Thermal',
    against: 'q = U·ΔT with ΔT in kelvin, against the same product worked by hand',
    source: `# Heat flow through a wall

U  = 0.17 W/(m^2*K)
dT = 22 K

q = U*dT -> W/m^2

// 0.17 x 22 = 3.74 W/m^2
q_closed = 3.74 W/m^2
abs(q - q_closed)/q_closed <= 1e-12

// The same difference written as an absolute temperature would be 295.15 K,
// and the answer would be out by a factor of thirteen. Longhand refuses that
// line rather than computing it, which is why this case can only be written
// the right way round.
dT_absolute = 22 degC -> K
T_closed = 295.15 K
abs(dT_absolute - T_closed)/T_closed <= 1e-12
`,
  },
  {
    id: 'regression',
    title: 'Least squares through four readings',
    field: 'Mathematics',
    against: 'The closed form: slope = Sxy/Sxx, intercept = ȳ − slope·x̄',
    source: `# A measurement series

table run
  t     | y
  1 s   | 2.1 mm
  2 s   | 3.9 mm
  3 s   | 6.2 mm
  4 s   | 7.8 mm
end

k = slope(run.t, run.y) -> mm/s
c = intercept(run.t, run.y) -> mm
q = r2(run.t, run.y)

// By hand: x-bar = 2.5, y-bar = 5.0, Sxy = 9.70, Sxx = 5.00
k_closed = 1.94 mm/s
abs(k - k_closed)/k_closed <= 1e-12

// c = 5.0 - 1.94 x 2.5 = 0.15
c_closed = 0.15 mm
abs(c - c_closed)/c_closed <= 1e-9

// r2 = Sxy^2/(Sxx Syy) = 94.09 / (5.00 x 18.90)
q_closed = 0.99566138
abs(q - q_closed)/q_closed <= 1e-7

// and the sample standard deviation, n-1 in the denominator
s = sd(run.y) -> mm
s_closed = 2.50998008 mm
abs(s - s_closed)/s_closed <= 1e-8
`,
  },
  {
    id: 'bilinear',
    title: 'Interpolation in two directions',
    field: 'Mathematics',
    against: 'Bilinear interpolation at the centre of a cell is the mean of its four corners',
    source: `# A conductivity table with two entry arguments

table k
  t      | T       | lambda
  50 mm  | 0 degC  | 0.035 W/(m*K)
  50 mm  | 40 degC | 0.039 W/(m*K)
  150 mm | 0 degC  | 0.031 W/(m*K)
  150 mm | 40 degC | 0.035 W/(m*K)
end

// The middle of the cell: (0.035 + 0.039 + 0.031 + 0.035)/4
middle = interp2(100 mm, 20 degC, k.t, k.T, k.lambda) -> W/(m*K)
middle_closed = 0.035 W/(m*K)
abs(middle - middle_closed)/middle_closed <= 1e-12

// Halfway along one axis only: (0.035 + 0.031)/2
edge = interp2(100 mm, 0 degC, k.t, k.T, k.lambda) -> W/(m*K)
edge_closed = 0.033 W/(m*K)
abs(edge - edge_closed)/edge_closed <= 1e-12

// and a corner comes back exactly
corner = interp2(50 mm, 40 degC, k.t, k.T, k.lambda) -> W/(m*K)
abs(corner - 0.039 W/(m*K))/(0.039 W/(m*K)) <= 1e-12
`,
  },
  {
    id: 'integral',
    title: 'Area under a triangular load',
    field: 'Mathematics',
    against: 'A triangle is half its base times its height, which integration must reproduce',
    source: `# Total load under a load that grows along the span

L = 6 m
w(x) = 2 kN/m^2*x

W = integral(w, 0 m, L) -> kN

// The load reaches 12 kN/m at the far end, so the area is 12 x 6 / 2
W_closed = 36 kN
abs(W - W_closed)/W_closed <= 1e-9

// and the slope of the load is the constant it was built from
s = deriv(w, 3 m) -> kN/m^2
abs(s - 2 kN/m^2)/(2 kN/m^2) <= 1e-6
`,
  },
  {
    id: 'iteration',
    title: 'Colebrook by iteration and by bisection',
    field: 'Fluids',
    against: 'The same equation solved two different ways must give the same friction factor',
    source: `# The friction factor, two ways

Re_D = 1e5
rr = 0.001

// As a fixed point: guess, compute, write the new value over the old one
step(f) = (-2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f))))^-2
f_iterated = iterate step(f_iterated) from 0.02

// And as a root to bracket and bisect
f = 0.02
lhs = 1/sqrt(f)
rhs = -2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f)))
f_solved = solve lhs = rhs for f

abs(f_iterated - f_solved)/f_solved <= 1e-6

// Worked by hand to convergence: 0.0221745
f_closed = 0.0221745
abs(f_iterated - f_closed)/f_closed <= 1e-5
`,
  },
  {
    id: 'two-unknowns',
    title: 'Two equations, two unknowns',
    field: 'Structures',
    against: 'A = bh and h = 2b rearrange by hand to b = √(A/2)',
    source: `# A section of a given area and a given proportion

b = 100 mm
h = 100 mm

A = b*h
r = h/b

b, h = solve A = 20000 mm^2 and r = 2 for b, h

// By hand: b = sqrt(20000/2) = 100 mm, h = 200 mm
b_closed = 100 mm
h_closed = 200 mm
abs(b - b_closed)/b_closed <= 1e-6
abs(h - h_closed)/h_closed <= 1e-6

// and both equations really do hold at the answer
abs(b*h - 20000 mm^2)/(20000 mm^2) <= 1e-6
`,
  },
  {
    id: 'lightest-section',
    title: 'The lightest section that still passes',
    field: 'Structures',
    against: 'Reading the table by eye: only two rows pass, and the lighter of those is IPE300',
    source: `# Choosing a section

M_Ed = 150 kN*m
f_y = 275 MPa
W_req = M_Ed/f_y -> mm^3

table steel
  profile | W_el        | mass
  IPE200  | 194e3 mm^3  | 22.4 kg/m
  IPE300  | 557e3 mm^3  | 42.2 kg/m
  IPE400  | 1160e3 mm^3 | 66.3 kg/m
end

// 150e3 / 275e6 = 5.4545e-4 m^3 = 545.45e3 mm^3
W_closed = 545454.5 mm^3
abs(W_req - W_closed)/W_closed <= 1e-6

ok = steel.W_el >= W_req
n = count_where(ok)

// IPE200 is too small; the other two pass
abs(n - 2) <= 1e-12

// Called m_pick rather than m: a variable named m would shadow the metre for
// every line below it, and "42.2 kg/m" would then mean kg per 42.2 kg/m.
m_pick = smallest(steel.mass, ok)
abs(m_pick - 42.2 kg/m)/(42.2 kg/m) <= 1e-12

choice = pick(steel.profile, steel.mass, ok)
`,
  },
  {
    id: 'correlated',
    title: 'Two measurements that move together',
    field: 'Uncertainty',
    against: 'Perfectly correlated errors add directly rather than in quadrature',
    source: `# The same instrument used twice

x = 100 mm +- 1 mm
y = 100 mm +- 1 mm

correlate x and y by 1

s = x + y -> mm

// Independent, the two would combine as sqrt(1 + 1) = 1.414 mm. Moving exactly
// together they add: 1 + 1 = 2 mm. The value itself is unchanged.
s_closed = 200 mm
abs(s - s_closed)/s_closed <= 1e-12
`,
    mustRead: [{ of: 's', contains: '± 2 mm' }],
  },
  {
    id: 'user-unit',
    title: 'A unit the sheet defined for itself',
    field: 'Units',
    against: '1 kgf = 9.80665 N, which is standard gravity times one kilogram',
    source: `# A unit this sheet needs and the engine does not ship

unit kgf = 9.80665 N

F = 100 kgf -> N

// 100 x 9.80665, and standard gravity is defined exactly
F_closed = 980.665 N
abs(F - F_closed)/F_closed <= 1e-12

// Defining a unit must not change how anything else is read
M = 250 kN*m
W = 1.25e7 mm^3
sigma = M/W -> MPa
abs(sigma - 20 MPa)/(20 MPa) <= 1e-12
`,
  },
]

export const FIELDS: Field[] = [
  'Structures',
  'Fluids',
  'Thermal',
  'Units',
  'Uncertainty',
  'Mathematics',
]

export const findCase = (id: string | null): Case | undefined =>
  CASES.find((candidate) => candidate.id === id)

// ---------------------------------------------------------------- running

import { evaluateSheet } from './engine'
import { summariseChecks, type CheckSummary } from './checks'

/** Fixed, so a case is verified against one stated presentation of its numbers. */
export const CASE_PRECISION = 4

export interface CaseResult {
  id: string
  ok: boolean
  checks: CheckSummary[]
  errors: { line: number; source: string; message: string }[]
  /** Expectations about a printed line that did not hold. */
  misread: { of: string; expected: string; actual: string }[]
}

/**
 * Run one case exactly as the app would run it.
 *
 * A case passes when the sheet produced no errors, every check in it held, and
 * any line the case pins reads what it says it should. Nothing here knows the
 * right answers: those are written into the sheets, next to where they came
 * from.
 */
export function runCase(subject: Case): CaseResult {
  const lines = evaluateSheet(subject.source, {
    precision: CASE_PRECISION,
    mode: subject.mode ?? 'quadrature',
  })

  const errors = lines.flatMap((line, index) =>
    line.kind === 'error' ? [{ line: index + 1, source: line.source, message: line.message }] : [],
  )

  const { checks } = summariseChecks(subject.source, lines)

  const sourceLines = subject.source.split('\n')
  const misread = (subject.mustRead ?? []).flatMap((expectation) => {
    const at = sourceLines.findIndex((text) =>
      new RegExp(`^\\s*${expectation.of}\\s*=`).test(text),
    )
    const line = at === -1 ? undefined : lines[at]
    const actual = line && 'summary' in line ? line.summary : '(no such line)'
    return actual.includes(expectation.contains)
      ? []
      : [{ of: expectation.of, expected: expectation.contains, actual }]
  })

  return {
    id: subject.id,
    ok: errors.length === 0 && checks.every((check) => check.pass) && misread.length === 0,
    checks,
    errors,
    misread,
  }
}

export interface SuiteResult {
  results: CaseResult[]
  passed: number
  failed: number
  checks: number
}

export function runSuite(cases: Case[] = CASES): SuiteResult {
  const results = cases.map(runCase)
  return {
    results,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    checks: results.reduce((total, result) => total + result.checks.length, 0),
  }
}
