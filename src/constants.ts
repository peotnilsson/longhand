/**
 * A sheet of constants, importable from any other sheet with
 * `import "Constants"`.
 *
 * Two kinds of number live here and they are kept firmly apart, because they
 * deserve different amounts of trust.
 *
 * The first block is exact. Since the 2019 revision of the SI, the Avogadro
 * constant, the Boltzmann constant, the Planck constant and the speed of light
 * are defined rather than measured, and the gas constant and the
 * Stefan–Boltzmann constant follow from them exactly. Standard gravity and the
 * standard atmosphere are defined too. Nothing in that block will change again.
 *
 * The second block is nominal: the values an engineer writes at the top of a
 * sheet without looking them up. They are conventional, they are close enough
 * for preliminary work, and they are not authoritative — a steel grade, a
 * concrete mix or a code of practice can say otherwise, and where it does, the
 * code wins.
 *
 * There are deliberately no partial safety factors here. They depend on the
 * code, the country's national annex and the design situation, and a stale or
 * wrong-jurisdiction factor sitting in a sheet is invisible. Write those out in
 * the sheet that uses them, where a checker can see them.
 */
export const CONSTANTS_SHEET = `# Constants

// Import this with:  import "Constants"

// ---------------------------------------------------------------- exact

// Defined by the SI, or following exactly from definitions. These do not
// change, and they do not need a source beyond the definition itself.

g_n     = 9.80665 m/s^2                  // standard gravity, defined 1901
c_0     = 299792458 m/s                  // speed of light in vacuum, defined
N_A     = 6.02214076e23 /mol             // Avogadro, defined 2019
k_B     = 1.380649e-23 J/K               // Boltzmann, defined 2019
h_P     = 6.62607015e-34 J*s             // Planck, defined 2019
R_gas   = 8.31446261815324 J/(mol*K)     // = N_A k_B, exact
sigma_SB = 5.670374419e-8 W/(m^2*K^4)    // = 2 pi^5 k^4 / (15 h^3 c^2), exact
p_atm   = 101325 Pa                      // standard atmosphere, defined
T_0     = 273.15 K                       // zero Celsius, defined

// ------------------------------------------------------------- nominal

// Conventional values for preliminary work. Check every one of these against
// the grade, the mix and the code you are actually designing to — where they
// disagree, the code is right and this sheet is wrong.

E_steel   = 210 GPa                      // nominal for structural steel
G_steel   = 81 GPa                       // nominal shear modulus
nu_steel  = 0.3                          // Poisson's ratio
rho_steel = 7850 kg/m^3

E_alu     = 70 GPa                       // nominal for structural aluminium
rho_alu   = 2700 kg/m^3

rho_concrete    = 2400 kg/m^3            // plain, normal weight
rho_concrete_rc = 2500 kg/m^3            // reinforced
// The elastic modulus of concrete depends on the grade and on the code that
// defines it, so there is no single number for it here. Work it out from your
// own grade, in the sheet, where a checker can see the formula you used.

rho_timber_c24 = 420 kg/m^3              // nominal for C24 softwood
rho_water      = 1000 kg/m^3             // fresh water, near 4 degC
rho_air        = 1.225 kg/m^3            // sea level, 15 degC, ISA

// Thermal, for envelope work
lambda_steel    = 50 W/(m*K)
lambda_concrete = 1.7 W/(m*K)
lambda_mineral  = 0.037 W/(m*K)          // mineral wool, typical
c_p_water       = 4182 J/(kg*K)          // near 20 degC
c_p_air         = 1005 J/(kg*K)          // dry, near 20 degC
`

/** The name a sheet imports it under. */
export const CONSTANTS_NAME = 'Constants'
