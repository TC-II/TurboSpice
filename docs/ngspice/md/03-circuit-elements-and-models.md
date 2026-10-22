# 3 Circuit Elements and Models

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Data fields that are enclosed in less-than and greater-than signs (‘< >’) are optional. All indicated
punctuation (parentheses, equal signs, etc.) is optional but indicate the presence of any
delimiter. Further, future implementations may require the punctuation as stated. A consistent
style adhering to the punctuation shown here makes the input easier to understand. With
respect to branch voltages and currents, ngspice uniformly uses the associated reference convention
(current flows in the direction of voltage drop).

## 3.1 About netlists, device instances, models and model pa-

        rameters

The input to ngspice is a netlist, which lists all circuit elements, their interconnects and model
parameters.

Netlist example of a simple bipolar amplifier:

      bipolar amplifier

      R3 vcc intc 10k
      R1 vcc intb 68k
      R2 intb 0 10k
      Cout out intc 10u
      Cin intb in 10u
      RLoad out 0 100k
      Q1 intc intb 0 BC546B

      VCC vcc 0 5
      Vin in 0 dc 0 ac 1 sin(0 1m 500)

      .model BC546B npn ( IS=7.59E-15 VAF=73.4 BF=480 IKF=0.0962
      + NE=1.2665 ISE=3.278E-15 IKR=0.03 ISC=2.00E-13 NC=1.2 NR=1
      + BR=5 RC=0.25 CJC=6.33E-12 FC=0.5 MJC=0.33 VJC=0.65
      + CJE=1.25E-11 MJE=0.55 VJE=0.65 TF=4.26E-10 ITF=0.6 VTF=3
      + XTF=20 RB=100 IRB=0.0001 RBM=10 RE=0.5 TR=1.50E-07)
      .end

After the first line, which is always a title line only, the netlist starts. Each line here is a device
instance (except for lines starting with a dot ’.’). We have simple circuit elements that consist of
a single line only, e.g. resistors like R3. In its simplest implementation, the resistor model does
not need any model parameters except for the resistance value (same for capacitors like Cout).
Netlist lines like R3 vcc intc 10k are called instance lines, as each line is the representation
of an instance of a generic model hard-coded into the ngspice simulator (here: resistor). R3
denotes the device name. Its first character R denotes a resistor. The next two tokens vcc intc
are the two nodes of the resistor, 10k is the resistance value. Equal node names on different
devices denote a connection between these nodes.
A more complex device is described by the instance line Q1 intc intb 0 BC546B. Q denotes
a bipolar transistor, intc intb 0 are the three nodes collector, base, and emitter. BC546B is the
name of a model parameter set, named after a real transistor and describing (together with the
implemented bipolar transistor model) its electrical behavior. The associated model parameters
are given in the line .model BC546B npn (IS=7.59E-15 ...). This is not an instance line,
because starting with a dot. It contains the model parameters as supplied by the device manufacturer
or by people having them extracted from the electrical behavior and data sheet (to be
found e.g. on his or her web pages). BC546B is the name of the model parameter set and
relates it to the device instance. npn is the type of the device. The parameters (name=value)
are given in brackets.
The instance Q1... requires model parameters. For a quick test one may do without device
maker’s model parameters.
Simplified bipolar transistor instance and model parameter set:

      Q1 intc intb 0 defaultmod
      .model defaultmod npn

If you enter the bipolar transistor instance as shown above, you make use of a default model
parameter set supplied by ngspice. defaultmod is an arbitrary name. This procedure models a
generic bipolar transistor, not resembling any commercial device. The default parameter values
may be assessed by the command showmod Q1.

You will get more information on devices, instances and models in the following chapters 3.3
to 12.

## 3.2 General options

### 3.2.1 Paralleling devices with multiplier m

When it is needed to simulate several devices of the same kind in parallel, use the ‘m’ (parallel
multiplier) instance parameter available for the devices listed in Table 3.1. This multiplies the
value of the element’s matrix stamp with m’s value. The netlist below shows how to correctly
use the parallel multiplier:

Multiple device example:

        d1 2 0 mydiode m=10
        d01 1 0 mydiode
        d02 1 0 mydiode
        d03 1 0 mydiode
        d04 1 0 mydiode
        d05 1 0 mydiode
        d06 1 0 mydiode
        d07 1 0 mydiode
        d08 1 0 mydiode
        d09 1 0 mydiode
        d10 1 0 mydiode
        ...

The d1 instance connected between nodes 2 and 0 is equivalent to the 10 parallel devices
d01-d10 connected between nodes 1 and 0.

The following devices support the multiplier m:

             First letter                   Element description
                  C                             Capacitor
                  D
                  F               Current-controlled current source (CCCs)
                  G              Voltage-controlled current source (VCCS)
                  I                             Current source
                  J                 Junction field effect transistor (JFET)
                  L                                Inductor
                 M             Metal oxide field effect transistor (MOSFET)
                  Q                   Bipolar junction transistor (BJT)
                  R                                Resistor
                  X                   Subcircuit (for details see below)
                  Z         Metal semiconductor field effect transistor (MESFET)
                    Table 3.1: ngspice elements supporting multiplier ’m’

When the X line (e.g. x1 a b sub1 m=5) contains the token m=value (as shown) or m=expression,
subcircuit invocation is done in a special way. If an instance line of the subcircuit sub1 contains
any of the elements shown in table 3.1, then these elements are instantiated with the additional
parameter m (in this example having the value 5). If such an element already has an m multiplier
parameter, the element m is multiplied with the m derived from the X line. This works recursively,
meaning that if a subcircuit contains another subcircuit (a nested X line), then the latter
m parameter will be multiplied by the former one, and so on.

Example 1:

      .param madd = 6
      X1 a b sub1 m=5
      .subckt sub1 a1 b1
         Cs1 a1 b1 C=5p m=’madd-2’
      .ends

In example 1, the capacitance between nodes a and b will be C = 5pF*(madd-2)*5 = 100pF.
Example 2:

      .param madd = 4
      X1 a b sub1 m=3
      .subckt sub1 a1 b1
         X2 a1 b1 sub2 m=’madd-2’
      .ends
      .subckt sub2 a2 b2
         Cs2 a2 b2 3p m=2
      .ends

In example 2, the capacitance between nodes a and b is C = 3pF*2*(madd-2)*3 = 36pF.
Using m may fail to correctly describe geometrical properties for real devices like MOS transistors.

M1 d g s nmos W=0.3u L=0.18u m=20
is probably not be the same as
M1 d g s nmos W=6u L=0.18u
because the former may suffer from small width (or edge) effects, whereas the latter is simply
a wide transistor.

### 3.2.2 Instance and model parameters

The simple device example below consists of two lines: The device is defined on the instance
line, starting with Lload ...: The first letter determines the device type (an inductor in this
example). Following the device name are two nodes 1 and 2, then the inductance value 1u
is set. The model name ind1 is a connection to the respective model line. Finally we have a
parameter on the instance line, together with its value dtemp=5. Parameters on an instance line
are called instance parameters.
The model line starts with the token .model, followed by the model name, the model type and
at least one model parameter, here tc1=0.001. There are complex models with more than 100
model parameters.

        Lload 1 2 1u ind1 dtemp=5
        .MODEL ind1 L tc1=0.001

Instance parameters are listed in each of the following device descriptions. Model parameters
sometimes are given below as well, for complex models like the BSIM transistor models, they
are available in the model makers documentation. Instance parameters may also be placed in
the .model line. Thus they are recognized by each device instance referring to that model. Their
values may be overridden for a specific instance of a device by placing them additionally onto
its instance line.

### 3.2.3 Model binning

Binning is a kind of range partitioning for geometry dependent models like MOSFET’s. The
purpose is to cover larger geometry ranges (Width and Length) with higher accuracy than the
model built-in geometry formulas. Each size range described by the additional model parameters
LMIN, LMAX, WMIN and WMAX has its own model parameter set. These model cards
are defined by a number extension, like ‘nch.1’. ngspice has an algorithm to choose the right
model card by the requested W and L.
This is implemented for BSIM3 (7.6.3.3) and BSIM4 (7.6.3.4) models.

### 3.2.4 Initial conditions

Two different forms of initial conditions may be specified for some devices. The first form
is included to improve the dc convergence for circuits that contain more than one stable state.
If a device is specified OFF, the dc operating point is determined with the terminal voltages
for that device set to zero. After convergence is obtained, the program continues to iterate to

obtain the exact value for the terminal voltages. If a circuit has more than one dc stable state,
the OFF option can be used to force the solution to correspond to a desired state. If a device
is specified OFF when in reality the device is conducting, the program still obtains the correct
solution (assuming the solutions converge) but more iterations are required since the program
must independently converge to two separate solutions.
The .NODESET control line (see Chapt. 11.2.1) serves a similar purpose as the OFF option. The
.NODESET option is easier to apply and is the preferred means to aid convergence. The second
form of initial conditions are specified for use with the transient analysis. These are true ‘initial
conditions’ as opposed to the convergence aids above. See the description of the .IC control
line (Chapt. 11.2.2) and the .TRAN control line (Chapt. 11.3.10) for a detailed explanation of
initial conditions.

## 3.3 Elementary Devices

### 3.3.1 Resistors

General form:

        RXXXXXXX n+ n- <resistance|r=>value <ac=val> <m=val>
        + <scale=val> <temp=val> <dtemp=val> <tc1=val> <tc2=val>
        + <noisy=0|1>

Examples:

        R1 1 2 100
        RC1 12 17 1K
        R2 5 7 1K ac=2K
        RL 1 4 2K m=2

Ngspice has a fairly complex model for resistors. It can simulate both discrete and semiconductor
resistors. Semiconductor resistors in ngspice means: resistors described by geometrical
parameters. So, do not expect detailed modeling of semiconductor effects.
n+ and n- are the two element nodes, value is the resistance (in ohms) and may be positive or
negative1 but not zero. If value resistance 0 is given, it will be automatically set to 1e-12.
Simulating small valued resistors: If you need to simulate very small resistors
(0.001 Ohm or less), you should use CCVS (transresistance). It is less
efficient but improves overall numerical accuracy. Consider a small resistance
as a large conductance.
Ngspice can assign a resistor instance a different value for AC analysis, specified using the
ac keyword. This value must not be zero as described above. The AC resistance is used in
AC analysis only (neither Pole-Zero nor Noise). If you do not specify the ac parameter, it is
defaulted to value.
Ngspice calculates the nominal resistance as
     1 A negative resistor modeling an active element can cause convergence problems, please avoid it.

                                                           VALUE scale
                                            Rnom =             m
                                                                                             (3.1)
                                                             ac scale
                                           Racnom =             m .

If you want to simulate temperature dependence of a resistor, you need to specify its temperature
coefficients, using a .model line or as instance parameters, like in the examples below:

Examples:

      RE1 1 2 800 newres dtemp=5
      .MODEL newres R tc1=0.001

      RE2 a b 1.4k tc1=2m tc2=1.4u

      RE3 n1 n2 1Meg tce=700m

The temperature coefficients tc1 and tc2 describe a quadratic temperature dependence (see
equation 1.6) of the resistance. If given in the instance line (the R... line) their values will
override the tc1 and tc2 of the .model line (3.3.3). Ngspice has an additional temperature
model equation 3.2 parameterized by tce given in model or instance line. If all parameters are
given (quadratic and exponential) the exponential temperature model is chosen.

                                                     h                 i
                                     R (T ) = R (T0 ) 1.01TCE·(T −T0 )                       (3.2)

where T is the circuit temperature, T0 is the nominal temperature, and TCE is the exponential
temperature coefficients.

Instance temperature is useful even if resistance does not vary with it, since the thermal noise
generated by a resistor depends on its absolute temperature. Resistors in ngspice generates two
different noises: thermal and flicker. While thermal noise is always generated in the resistor, to
add a flicker noise2 source you have to add a .model card defining the flicker noise parameters.
It is possible to simulate resistors that do not generate any kind of noise using the noisy (or
noise) keyword and assigning zero to it, as in the following example:

Example:

      Rmd 134 57 1.5k noisy=0

If you are interested in temperature effects or noise equations, read the next section on semiconductor
resistors.

  2 Flicker noise can be used to model carbon resistors.

### 3.3.2 Semiconductor Resistors

General form:

        RXXXXXXX n+ n- <value> <mname> <l=length> <w=width>
        + <temp=val> <dtemp=val> <m=val> <ac=val> <scale=val>
        + <noisy = 0|1>

Examples:

        RLOAD 2 10 10K
        RMOD 3 7 RMODEL L=10u W=1u

This is the more general form of the resistor presented before (3.3.1) and allows the modeling of
temperature effects and for the calculation of the actual resistance value from strictly geometric
information and the specifications of the process. If value is specified, it overrides the geometric
information and defines the resistance. If mname is specified, then the resistance may be
calculated from the process information in the model mname and the given length and width.
If value is not specified, then mname and length must be specified. If width is not specified,
then it is taken from the default width given in the model.
The (optional) temp value is the temperature at which this device is to operate, and overrides
the temperature specification on the .option control line and the value specified in dtemp.

### 3.3.3 Semiconductor Resistor Model (R)

The resistor model consists of process-related device data that allow the resistance to be calculated
from geometric information and to be corrected for temperature. The parameters available
are as follows:
   Name                           Parameter                Units   Default   Example
    TC1               first order temperature coeff.       Ω/◦C      0.0         -
    TC2             second order temperature coeff.        Ω/◦C2     0.0         -
   RSH                         sheet resistance             Ω/□       -         50
  DEFW                          default width                m      1e-6       2e-6
 NARROW              narrowing due to side etching           m       0.0       1e-7
  SHORT              shortening due to side etching          m       0.0       1e-7
  TNOM           parameter measurement temperature          ◦C       27         50
    KF                    flicker noise coefficient                  0.0      1e-25
    AF                     flicker noise exponent                    0.0        1.0
    WF                flicker noise width exponent                   1.0
     LF               flicker noise length exponent                  1.0
     EF            flicker noise frequency exponent                  1.0
  R (RES)       default value if element value not given    Ω         -        1000
The sheet resistance is used with the narrowing parameter and l and w from the resistor device
to determine the nominal resistance by the formula:

                                                    l − SHORT
                                    Rnom = rsh                                                 (3.3)
                                                   w − NARROW

DEFW is used to supply a default value for w if one is not specified for the device. If either rsh or
l is not specified, then the standard default resistance value of 1 mOhm is used. TNOM is used to
override the circuit-wide value given on the .options control line where the parameters of this
model have been measured at a different temperature. After the nominal resistance is calculated,
it is adjusted for temperature by the formula:

                                                                   
               R(T ) = R(TNOM) 1 + TC1 (T − TNOM) + TC2 (T − TNOM)2                            (3.4)

where R(TNOM) = Rnom |Racnom . In the above formula, ‘T ’ represents the instance temperature,
which can be explicitly set using the temp keyword or calculated using the circuit temperature
and dtemp, if present. If both temp and dtemp are specified, the latter is ignored. Ngspice
improves SPICE’s resistors noise model, adding flicker noise (1/ f ) to it and the noisy (or
noise) keyword to simulate noiseless resistors. The thermal noise in resistors is modeled
according to the equation:

                                                   4kT
                                            i¯2R =     ∆f                                      (3.5)
                                                    R

where ‘k’ is the Boltzmann’s constant, and ‘T ’ the instance temperature.

Flicker noise model is:

                                                    KFIRAF
                                     i2R¯f n =                  ∆f                             (3.6)
                                                 W W F LLF f EF

A small list of sheet resistances (in Ω/□) for conductors is shown below. The table represents
typical values for MOS processes in the 0.5 - 1 um

range. The table is taken from: N. Weste, K. Eshraghian - Principles of CMOS VLSI Design
2nd Edition, Addison Wesley.

             Material              Min.     Typ.        Max.
 Inter-metal (metal1 - metal2)     0.005    0.007        0.1
      Top-metal (metal3)           0.003    0.004       0.05
       Polysilicon (poly)            15       20         30
             Silicide                 2        3          6
       Diffusion (n+, p+)            10       25         100
       Silicided diffusion            2        4         10
              n-well               1000     2000        5000

### 3.3.4 Resistors, dependent on expressions (behavioral resistor)

General form:

        RXXXXXXX n+ n- R = ’expression’ <tc1=value> <tc2=value> <noisy=0>
        RXXXXXXX n+ n- ’expression’ <tc1=value> <tc2=value> <noisy=0>

Examples:

        R1 rr 0 r = ’V(rr) < {Vt} ? {R0} : {2*R0}’ tc1=2e-03 tc2=3.3e-06
        R2 r2 rr r = {5k + 50*TEMPER}
        .param rp1 = 20
        R3 no1 no2 r = ’5k * rp1’ noisy=1

Expression may be an equation or an expression containing node voltages or branch currents
(in the form of i(vm)) and any other terms as given for the B source and described in Chapt. 5.1.
It may contain parameters (2.11.1) and the special variables time, temper, and hertz (5.1.2).
An example file is given below. Small signal noise in the resistor (11.3.4) may be evaluated as
white noise, depending on resistance, temperature and tc1, tc2. To enable noise calculation, add
the flag noisy=1 to the instance line. As a default the behavioral resistor is noiseless.

Example input file for non-linear resistor:

        Non-linear resistor
        .param R0=1k Vi=1 Vt=0.5
        * resistor depending on control voltage V(rr)
        R1 rr 0 r = ’V(rr) < {Vt} ? {R0} : {2*R0}’
        * control voltage
        V1 rr 0 PWL(0 0 100u {Vi})
        .control
        unset askquit
        tran 100n 100u uic
        plot i(V1)
        .endc
        .end

### 3.3.5 Resistor with nonlinear r2_cmc or r3_cmc models

2-terminal resistor models developed by the resistor subcommittee of the CMC are made available
via the OSDI interface by loading OpenVAF-compiled Verilog-A models (see chapter 9.2
for details). The goal was to have a standard 2-terminal resistor model with standard parameter
names and a standard, numerically well behaved nonlinearity model.

### 3.3.6 Capacitors

General form:

        CXXXXXXX n+ n- <value> <mname> <m=val> <scale=val> <temp=val>
        + <dtemp=val> <tc1=val> <tc2=val> <ic=init_condition>

Examples:

        CBYP 13 0 1UF
        COSC 17 23 10U IC=3V

Ngspice provides a detailed model for capacitors. Capacitors in the netlist can be specified
giving their capacitance or their geometrical and physical characteristics. Following the original
SPICE3 ‘convention’, capacitors specified by their geometrical or physical characteristics are
called ‘semiconductor capacitors’ and are described in the next section.
In this first form n+ and n- are the positive and negative element nodes, respectively and value
is the capacitance in Farads.
Capacitance can be specified in the instance line as in the examples above or in a .model line,
as in the example below:

        C1 15 5 cstd
        C2 2 7 cstd
        .model cstd C cap=3n

Both capacitors have a capacitance of 3nF.
If you want to simulate temperature dependence of a capacitor, you need to specify its temperature
coefficients, using a .model line, like in the example below:

        CEB 1 2 1u cap1 dtemp=5
        .MODEL cap1 C tc1=0.001

The (optional) initial condition is the initial (time zero) value of capacitor voltage (in Volts).
Note that the initial conditions (if any) apply only if the uic option is specified on the .tran
control line.
Ngspice calculates the nominal capacitance as described below:

                                     Cnom = value · scale · m                                (3.7)

The temperature coefficients tc1 and tc2 describe a quadratic temperature dependence (see
equation13.14) of the capacitance. If given in the instance line (the C... line) their values will
override the tc1 and tc2 of the .model line (3.3.8).

### 3.3.7 Semiconductor Capacitors

General form:

        CXXXXXXX n+ n- <value> <mname> <l=length> <w=width> <m=val>
        + <scale=val> <temp=val> <dtemp=val> <ic=init_condition>

Examples:

        CLOAD 2 10 10P
        CMOD 3 7 CMODEL L=10u W=1u

This is the more general form of the Capacitor presented in section (3.3.6), and allows for the
calculation of the actual capacitance value from strictly geometric information and the specifications
of the process. If value is specified, it defines the capacitance and both process and
geometrical information are discarded. If value is not specified, the capacitance is calculated
from information contained model mname and the given length and width (l, w keywords, respectively).
It is possible to specify mname only, without geometrical dimensions and set the capacitance in
the .model line (3.3.6).

### 3.3.8 Semiconductor Capacitor Model (C)

The capacitor model contains process information that may be used to compute the capacitance
from strictly geometric information.
   Name                        Parameter               Units    Default   Example
   CAP                    model capacitance              F        0.0       1e-6
     CJ             junction bottom capacitance        F/m2        -        5e-5
   CJSW            junction sidewall capacitance        F/m        -       2e-11
  DEFW                   default device width            m       1e-6       2e-6
   DEFL                  default device length           m        0.0       1e-6
 NARROW            narrowing due to side etching         m        0.0       1e-7
  SHORT            shortening due to side etching        m        0.0       1e-7
    TC1             first order temperature coeff.     F/◦C       0.0       0.001
    TC2           second order temperature coeff.      F/◦C2      0.0      0.0001
  TNOM          parameter measurement temperature       ◦C        27          50
     DI               relative dielectric constant      F/m        -           1
  THICK                   insulator thickness            m        0.0       1e-9
The capacitor has a capacitance computed as:
If value is specified on the instance line then

                                     Cnom = value · scale · m                              (3.8)

If model capacitance is specified then

                                    Cnom = CAP · scale · m                                    (3.9)

If neither value nor CAP are specified, then geometrical and physical parameters are take into
account:

    C0 = CJ(l − SHORT)(w − NARROW) + 2CJSW(l − SHORT + w − NARROW)                        (3.10)

CJ can be explicitly given on the .model line or calculated by physical parameters. When CJ is
not given, is calculated as:
If THICK is not zero:

                                      DI ε0
                                CJ = THICK  if DI is specified,
                                                                                          (3.11)
                                      εSiO2
                                CJ = THICK        otherwise.

If the relative dielectric constant is not specified the one for SiO2 is used. The values of the
                                         F                                   F
constants are ε0 = 8.854214871e − 12 m      and εSiO2 = 3.4531479969e − 11 m   . The nominal capacitance
is then computed as:

                                       Cnom = C0 scale m                                  (3.12)

After the nominal capacitance is calculated, it is adjusted for temperature by the formula:

                                                                   
               C(T ) = C(TNOM) 1 + TC1 (T − TNOM) + TC2 (T − TNOM)2                       (3.13)

where C(TNOM) = Cnom .
In the above formula, ‘T ’ represents the instance temperature, which can be explicitly set using
the temp keyword or calculated using the circuit temperature and dtemp, if present.

### 3.3.9 Capacitors, dependent on expressions (behavioral capacitor)

There are two forms for behavioral capacitors allowed:

   1. Capacitance formulated expressions C = ’expression’

   2. Charge formulated expressions Q = ’expression’

General form:

      CXXXXXXX n+ n- C = ’expression’ <tc1=value> <tc2=value>
      CXXXXXXX n+ n- ’expression’ <tc1=value> <tc2=value>

      CXXXXXXX n+ n- Q = ’expression’ <tc1=value> <tc2=value>

Examples:

      C1 cc 0 c = ’V(cc) < {Vt} ? {C1} : {Ch}’ tc1=-1e-03 tc2=1.3e-05
      C1 a b q = ’1u*(4*atan(V(a,b)/4)*2+V(a,b))/3’

Expression may be an equation or an expression containing node voltages or branch currents
(in the form of i(vm)) and any other terms as given for the B source and described in Chapt. 5.1.
It may contain parameters (2.11.1) and the special variables time, temper, and hertz (5.1.2).

Example input file:

      Behavioral Capacitor
      .param Cl=5n Ch=1n Vt=1m Il=100n
      .ic v(cc) = 0    v(cc2) = 0
      * capacitor depending on control voltage V(cc)
      C1 cc 0 c = ’V(cc) < {Vt} ? {Cl} : {Ch}’
      I1 0 1 {Il}
      Exxx n1-copy n2 n2 cc2 1
      Cxxx n1-copy n2 1
      Bxxx cc2 n2 I = ’(V(cc2) < {Vt} ? {Cl} : {Ch})’ * i(Exxx)
      I2 n2 22 {Il}
      vn2 n2 0 DC 0
      * measure charge by integrating current
      aint1 %id(1 cc) 2 time_count
      aint2 %id(22 cc2) 3 time_count
      .model time_count int(in_offset=0.0 gain=1.0
      + out_lower_limit=-1e12 out_upper_limit=1e12
      + limit_range=1e-9 out_ic=0.0)
      .control
      unset askquit
      tran 100n 100u
      plot v(2)
      plot v(cc) v(cc2)
      .endc
      .end

### 3.3.10 Inductors

General form:

      LYYYYYYY n+ n- <value> <mname> <nt=val> <m=val>
      + <scale=val> <temp=val> <dtemp=val> <tc1=val>
      + <tc2=val> <ic=init_condition>

Examples:

      LLINK 42 69 1UH
      LSHUNT 23 51 10U IC=15.7MA

The inductor device implemented into ngspice has many enhancements over the original one.n+
and n- are the positive and negative element nodes, respectively. value is the inductance in
Henry. The initial condition (a curremt through L) becomes effective when the uic parameter
is set on the .tran line. Inductance can be specified in the instance line as in the examples
above or in a .model line, as in the example below:

      L1 15 5 indmod1
      L2 2 7 indmod1
      .model indmod1 L ind=3n

Both inductors have an inductance of 3nH.
The nt is used in conjunction with a .model line, and is used to specify the number of turns
of the inductor. If you want to simulate temperature dependence of an inductor, you need to
specify its temperature coefficients, using a .model line, like in the example below:

      Lload 1 2 1u ind1 dtemp=5
      .MODEL ind1 L tc1=0.001

The (optional) initial condition is the initial (time zero) value of inductor current (in Amps) that
flows from n+, through the inductor, to n-. Note that the initial conditions (if any) apply only if
the UIC option is specified on the .tran analysis line.
Ngspice calculates the nominal inductance as described below:

                                                value scale
                                       Lnom =                                                (3.14)
                                                    m

### 3.3.11 Inductor model

The inductor model contains physical and geometrical information that may be used to compute
the inductance of some common topologies like solenoids and toroids, wound in air or other
material with constant magnetic permeability.

   Name                     Parameter                    Units   Default       Example
   IND                   model inductance                 H       0.0            1e-3
  CSECT                    cross section                  m2      0.0            1e-6
   DIA                     coil diameter                  m       0.0            1e-3
 LENGTH                        length                     m       0.0            1e-2
   TC1            first order temperature coeff.         H/◦C     0.0            0.001
   TC2          second order temperature coeff.          H/◦C2    0.0           0.0001
  TNOM        parameter measurement temperature           ◦C       27              50
    NT                    number of turns                  -      0.0              10
    MU           relative magnetic permeability            -      1.0               -
The inductor’s inductance is computed as follows:

If value is specified on the instance line then

                                                  value scale
                                        Lnom =                                           (3.15)
                                                      m

If model inductance is specified then

                                                  IND scale
                                        Lnom =                                           (3.16)
                                                     m

If neither value nor IND are specified, then geometrical and physical parameters are taken into
account. In the following formulas

NT refers to both instance and model parameter (instance parameter overrides model parameter):

If LENGTH is not zero:

                         (               2     2
                          Lnom = MU4µLENGTH
                                     0 NT π DIA
                                                        if DIA is specified,
                                           2                                             (3.17)
                           Lnom = MU µLENGTH
                                       0 NT CSECT
                                                        otherwise.

with µ0 = 1.25663706143592 µH      m . DIA takes preference over CSECT. kl is the geometry correction
factor according to Lundin (see D. W. Knight, pp. 35-36), which is important when
inductor length and diameter have the same order of magnitude. After the nominal inductance
is calculated, it is adjusted for temperature by the formula

                                                                 
              L(T ) = L(TNOM) 1 + TC1 (T − TNOM) + TC2 (T − TNOM)2 ,                     (3.18)

where L(TNOM) = Lnom . In the above formula, ‘T ’ represents the instance temperature, which
can be explicitly set using the temp keyword or calculated using the circuit temperature and
dtemp, if present.

### 3.3.12 Coupled (Mutual) Inductors

General form:

      KXXXXXXX LYYYYYYY LZZZZZZZ value

Examples:

      K43 LAA LBB 0.999
      KXFRMR L1 L2 0.87

LYYYYYYY and LZZZZZZZ are the names of the two coupled inductors, and value is the
coefficient of coupling, K, which must be greater than 0 and less than or equal to 1. Using
the ‘dot’ convention for drawing the coupled inductors, place a ‘dot’ on the first node of each
inductor. If you have more than two inductors interacting, pairwise coupling is supported.

Pairwise coupling of more than two inductors:

      L1 1 0    10u
      L2 2 0    11u
      L3 3 0    10u

      K12 L1 L2 0.99
      K23 L2 L3 0.99
      K13 L1 L3 0.98

When there are more than two inductors coupled for interaction, some combinations of coupling
constants are not possible physically because the magnetic fields then would violate energy
conservation. ngspice checks the coupling matrix for such conditions and issues a warning.

Coupling of more than two inductors in a single K statement is supported as well. All coupling
constants are then equal.

Coupling of more than two inductors in a single statement:

      L1 1 0    10u
      L2 2 0    11u
      L3 3 0    10u

      K123 L1 L2 L3 0.97

### 3.3.13 Inductors, dependent on expressions (behavioral inductor)

General form:

      LXXXXXXX n+ n- L = ’expression’ <tc1=value> <tc2=value>
      LXXXXXXX n+ n- ’expression’ <tc1=value> <tc2=value>

Examples:

      L1 l2 lll L = ’i(Vm) < {It} ? {Ll} : {Lh}’ tc1=-4e-03 tc2=6e-05

Expression may be an equation or an expression containing node voltages or branch currents
(in the form of i(vm)) and any other terms as given for the B source and described in Chapt. 5.1.
It may contain parameters (2.11.1) and the special variables time, temper, and hertz (5.1.2).

Example input file:

      Variable inductor
      .param Ll=0.5m Lh=5m It=50u Vi=2m
      .ic v(int21) = 0

      * variable inductor depending on control current i(Vm)
      L1 l2 lll L = ’i(Vm) < {It} ? {Ll} : {Lh}’
      * measure current through inductor
      vm lll 0 dc 0
      * voltage on inductor
      V1 l2 0 {Vi}

      * fixed inductor
      L3 33 331 {Ll}
      * measure current through inductor
      vm33 331 0 dc 0
      * voltage on inductor
      V3 33 0 {Vi}

      * non linear inductor (discrete setup)
      F21 int21 0 B21 -1
      L21 int21 0 1
      B21 n1 n2 V = ’(i(Vm21) < {It} ? {Ll} : {Lh})’ * v(int21)
      * measure current through inductor
      vm21 n2 0 dc 0
      V21 n1 0 {Vi}

      .control
      unset askquit
      tran 1u 100u uic
      plot i(Vm) i(vm33)
      plot i(vm21) i(vm33)
      plot i(vm)-i(vm21)
      .endc
      .end

### 3.3.14 Capacitor or inductor with initial conditions

The simulator supports the specification of voltage and current initial conditions on capacitor
and inductor models, respectively. These models are not the standard ones supplied with
SPICE3, but are in fact code models that can be substituted for the SPICE models when realistic
initial conditions are required. For details please refer to Chapter 8. A XSPICE deck
example using these models is shown below:

      *
      * This circuit contains a capacitor and an inductor with

      * initial conditions on them. Each of the components
      * has a parallel resistor so that an exponential decay
      * of the initial condition occurs with a time constant of
      * 1 second.
      *
      a1 1 0 cap
      .model cap capacitoric (c=1000uf ic=1)
      r1 1 0 1k
      *
      a2 2 0 ind
      .model ind inductoric (l=1H ic=1)
      r2 2 0 1.0
      *
      .control
      tran 0.01 3
      plot v(1) v(2)
      .endc
      .end

### 3.3.15 Switches

Two types of switches are available: a voltage controlled switch (type SXXXXXX, model SW)
and a current controlled switch (type WXXXXXXX, model CSW). A switching hysteresis may
be defined, as well as on- and off-resistances (0 < R < ∞).
General form:

      SXXXXXXX N+ N- NC+ NC- MODEL <ON><OFF>
      WYYYYYYY N+ N- VNAM MODEL <ON><OFF>

Examples:

      s1 1 2 3 4 switch1 ON
      s2 5 6 3 0 sm2 off
      Switch1 1 2 10 0 smodel1
      w1 1 2 vclock switchmod1
      W2 3 0 vramp sm1 ON
      wreset 5 6 vclck lossyswitch OFF

Nodes 1 and 2 are the nodes between which the switch terminals are connected. The model
name is mandatory while the initial conditions are optional. For the voltage controlled switch,
nodes 3 and 4 are the positive and negative controlling nodes respectively. For the current
controlled switch, the controlling current is that through the specified voltage source. The
direction of positive controlling current flow is from the positive node, through the source, to
the negative node.
The instance parameters ON or OFF are required, when the controlling voltage (current) starts
inside the range of the hysteresis loop (different outputs during forward vs. backward voltage
or current ramp). Then ON or OFF determine the initial state of the switch.

### 3.3.16 Switch Model (SW/CSW)

The switch model allows an almost ideal switch to be described in ngspice. The switch is not
quite ideal, in that the resistance can not change from 0 to infinity, but must always have a finite
positive value. By proper selection of the on and off resistances, they can be effectively zero
and infinity in comparison to other circuit elements. The parameters available are shown below.

 Name         Parameter         Units                  Default                  Switch model
  VT      threshold voltage      V                       0.0                        SW
  IT      threshold current      A                       0.0                       CSW
  VH      hysteresis voltage     V                       0.0                        SW
  IH      hysteresis current     A                       0.0                       CSW
 RON        on resistance        Ω                       1.0                     SW,CSW
 ROFF       off resistance       Ω                   1.0e+12 (*)                 SW,CSW

(*) Or 1/GMIN, if you have set GMIN to any other value, see the .OPTIONS control line
(11.1.2) for a description of GMIN, its default value results in an off-resistance of 1.0e+12
ohms.

The use of an ideal element that is highly nonlinear such as a switch can cause large discontinuities
to occur in the circuit node voltages. A rapid change such as that associated with a switch
changing state can cause numerical round-off or tolerance problems leading to erroneous results
or time step difficulties. The user of switches can improve the situation by taking the following
steps:

    • First, it is wise to set the ideal switch impedance just high or low enough to be negli-
      gible with respect to other circuit elements. Using switch impedances that are close to
      ‘ideal’ in all cases aggravates the problem of discontinuities mentioned above. Of course,
      when modeling real devices such as MOSFETS, the on resistance should be adjusted to a
      realistic level depending on the size of the device being modeled.

    • If a wide range of ON to OFF resistance must be used in the switches (ROFF/RON >
      1e+12), then the tolerance on errors allowed during transient analysis should be decreased
      by using the .OPTIONS control line and specifying TRTOL to be less than the default value
      of 7.0.

    • When switches are placed around capacitors, then the option CHGTOL should also be re-
      duced. Suggested values for these two options are 1.0 and 1e-16 respectively. These
      changes inform ngspice to be more careful around the switch points so that no errors are
      made due to the rapid change in the circuit.

Example input file:

      Switch test
      .tran 2us 5ms
      *switch control voltage
      v1 1 0 DC 0.0 PWL(0 0 2e-3 2 4e-3 0)
      *switch control voltage starting inside hysteresis window
      *please note influence of instance parameters ON, OFF
      v2 2 0 DC 0.0 PWL(0 0.9 2e-3 2 4e-3 0.4)
      *switch control current
      i3 3 0 DC 0.0 PWL(0 0 2e-3 2m 4e-3 0) $ <--- switch control current
      *load voltage
      v4 4 0 DC 2.0
      *input load for current source i3
      r3 3 33 10k
      vm3 0 33 dc 0 $ <--- measure the current
      * ouput load resistors
      r10 4 10 10k
      r20 4 20 10k
      r30 4 30 10k
      r40 4 40 10k
      *
      s1 10 0 1 0 switch1 OFF
      s2 20 0 2 0 switch1 OFF
      s3 30 0 2 0 switch1 ON
      .model switch1 sw vt=1 vh=0.2 ron=1 roff=10k
      *
      w1 40 0 vm3 wswitch1 off
      .model wswitch1 csw it=1m ih=0.2m ron=1 roff=10k
      *
      .control
      run
      set xbrushwidth=3
      plot v(1) v(10)
      plot v(10) vs v(1) retraceplot $ <-- get hysteresis loop
      plot v(2) v(20) $ <--- different initial values
      plot v(20) vs v(2) retraceplot $ <-- get hysteresis loop
      plot v(2) v(30) $ <--- different initial values
      plot v(30) vs v(2) retraceplot $ <-- get hysteresis loop
      plot v(40) vs vm3#branch retraceplot $ <--- current controlled switch hysteresis
      .endc
      .end
