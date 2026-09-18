/**
 * Four worked calculations, each solving a real problem rather than
 * demonstrating a feature. They are the landing page's gallery and the docs
 * page's "try it" — and, because a test evaluates every one of them and
 * insists on no errors, a check that the language still does what the
 * documentation claims.
 */
export interface Example {
  id: string
  name: string
  /** One line for the gallery. */
  blurb: string
  /** What is worth noticing in it. */
  shows: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    id: 'beam',
    name: 'Steel beam, section A-A',
    blurb: 'A simply supported beam checked against a table of rolled sections.',
    shows:
      'Units as written, a check with its margin, a section table read by name, and solve finding the section modulus actually required.',
    source: `# Steel beam - section A-A

// Span and loading
L     = 8 m
g_k   = 6 kN/m            // permanent
q_k   = 9 kN/m            // imposed
w     = 1.35*g_k + 1.5*q_k
M_Ed  = w*L^2/8

// Material
f_y   = 355 MPa

// Elastic section modulus of a few rolled sections
table sections
  profile | h      | W_el
  IPE300  | 300 mm | 5.57e5 mm^3
  IPE360  | 360 mm | 9.04e5 mm^3
  IPE400  | 400 mm | 1.16e6 mm^3
end

// Try an IPE360
W_el  = lookup("IPE360", sections.profile, sections.W_el)
sigma = M_Ed/W_el  -> MPa

sigma <= f_y

// What modulus would just about do?
W_req = solve sigma = f_y for W_el

// The lightest section that works is the smallest W_el above W_req.
`,
  },
  {
    id: 'pump',
    name: 'Pump duty point',
    blurb: 'Head loss in a cooling-water line, with the friction factor solved from Colebrook.',
    shows:
      'solve doing what a spreadsheet needs a macro or a circular reference for: Colebrook is implicit in f, so the sheet solves it in place.',
    source: `# Pump duty point - cooling water

// Duty and pipe
Q     = 12 l/s
d     = 80 mm
L     = 45 m
eps   = 0.045 mm          // commercial steel

// Water at 20 degC
rho   = 998 kg/m^3
mu    = 1.0e-3 Pa*s
g     = 9.81 m/s^2

A     = pi*d^2/4
v     = Q/A               -> m/s
Re    = rho*v*d/mu

// Colebrook is implicit in f: both sides depend on it, so solve it
f     = 0.02
left  = 1/sqrt(f)
right = -2*log10(eps/(3.7*d) + 2.51/(Re*sqrt(f)))
f_D   = solve left = right for f from 0.005 to 0.1

// Darcy-Weisbach, plus the static lift
h_f      = f_D*(L/d)*v^2/(2*g)  -> m
h_static = 6 m
H        = h_static + h_f

// The pump has to deliver H at Q.
`,
  },
  {
    id: 'wall',
    name: 'Wall U-value',
    blurb: 'A build-up checked against a 0.18 W/m²K limit, with the insulation thickness uncertain.',
    shows:
      'A tolerance propagating all the way to the answer, and the contribution shares showing which layer the result really depends on.',
    source: `# Wall U-value and heat loss

// Layers, inside out
t_gypsum = 13 mm
k_gypsum = 0.25 W/(m*K)
t_ins    = 195 mm +- 5 mm     // as built, not as drawn
k_ins    = 0.036 W/(m*K)
t_brick  = 120 mm
k_brick  = 0.77 W/(m*K)

// Surface resistances
R_si = 0.13 m^2*K/W
R_se = 0.04 m^2*K/W

R_tot = R_si + t_gypsum/k_gypsum + t_ins/k_ins + t_brick/k_brick + R_se
U     = 1/R_tot  -> W/(m^2*K)

U <= 0.18 W/(m^2*K)

// Heat through one facade
A      = 42 m^2
dT     = 22 K                 // a temperature difference, so K and not degC
Q_loss = U*A*dT  -> W

// How thin could the insulation get before the limit is missed?
t_min = solve U = 0.18 W/(m^2*K) for t_ins
`,
  },
  {
    id: 'density',
    name: 'Density from mass and volume',
    blurb: 'A measurement with its error budget, showing which instrument limits the answer.',
    shows:
      'First-order propagation in quadrature, and contribution shares that sum to 100% — the diameter dominates because it enters squared.',
    source: `# Density of a cylinder - error budget

// Measured, each with the instrument's uncertainty
m = 250.4 g   +- 0.1 g        // balance
d = 24.98 mm  +- 0.02 mm      // micrometer
h = 60.05 mm  +- 0.05 mm      // caliper

V   = pi*d^2/4*h
rho = m/V  -> kg/m^3

// The +- on V is the error budget: the diameter contributes about four fifths
// of it, because it enters squared, and the caliper reading the rest. Settings
// -> Tolerances -> Worst case gives the pessimistic bound instead.
`,
  },
]

export const findExample = (id: string | null): Example | undefined =>
  id ? EXAMPLES.find((example) => example.id === id) : undefined
