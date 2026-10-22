# 6 Transmission Lines

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Ngspice implements both the original SPICE3f5 transmission lines models and the one introduced
with KSPICE. The latter provide an improved transient analysis of lossy transmission
lines. Unlike SPICE models that use the state-based approach to simulate lossy transmission
lines, KSPICE simulates lossy transmission lines and coupled multiconductor line systems using
the recursive convolution method. The impulse response of an arbitrary transfer function
can be determined by deriving a recursive convolution from the Pade approximations of the
function. We use this approach for simulating each transmission line’s characteristics and each
multiconductor line’s modal functions. This method of lossy transmission line simulation has
been proved to give a speedup of one to two orders of magnitude over SPICE3f5.

## 6.1 Lossless Transmission Lines

General form:

      TXXXXXXX N1 N2 N3 N4 Z0=VALUE <TD=VALUE>
      + <F=FREQ <NL=NRMLEN>> <IC=V1, I1, V2, I2>

Examples:

      T1 1 0 2 0 Z0=50 TD=10NS

n1 and n2 are the nodes at port 1; n3 and n4 are the nodes at port 2. z0 is the characteristic
impedance. The length of the line may be expressed in either of two forms. The transmission
delay, td, may be specified directly (as td=10ns, for example). Alternatively, a frequency f may
be given, together with nl, the normalized electrical length of the transmission line with respect
to the wavelength in the line at the frequency f. The transmission delay then is calculated as
td = nl/ f .If a frequency is specified but nl is omitted, 0.25 is assumed (that is, the frequency
is assumed to be the quarter-wave frequency). Note that although both forms for expressing the
line length are indicated as optional, one of the two must be specified.
No .model line is required for this element.
Note that this element models only one propagating mode. If all four nodes are distinct in the actual
circuit, then two modes may be excited. To simulate such a situation, two transmission-line

elements are required. (see the example in Chapt. 17.7 for further clarification.) The (optional)
initial condition specification consists of the voltage and current at each of the transmission line
ports. Note that the initial conditions (if any) apply only if the UIC option is specified on the
.TRAN control line.

Note that a lossy transmission line (see below) with zero loss may be more accurate than the
lossless transmission line due to implementation details.

## 6.2 Lossy Transmission Lines

General form:

        OXXXXXXX n1 n2 n3 n4 mname

Examples:

        O23 1 0 2 0 LOSSYMOD
        .model LOSSYMOD ltra rel=1 r=12.45 g=0 l=8.972e-9 c=0.468e-12
        +len=16 steplimit compactrel=1.0e-3 compactabs=1.0e-14

        OCONNECT 10 5 20 5 INTERCONNECT

This is a two-port convolution model for single conductor lossy transmission lines. n1 and n2
are the nodes at port 1; n3 and n4 are the nodes at port 2. Note that a lossy transmission line
with zero loss may be more accurate than the lossless transmission line due to implementation
details.

### 6.2.1 Lossy Transmission Line Model (LTRA)

The uniform RLC/RC/LC/RG transmission line model (referred to as the LTRA model henceforth)
models a uniform constant-parameter distributed transmission line. The RC and LC cases
may also be modeled using the URC and TRA models; however, the newer LTRA model is usually
faster and more accurate than the others. The operation of the LTRA model is based on the
convolution of the transmission line’s impulse responses with its inputs (see [8]). The LTRA
model takes a number of parameters, some of which must be given and some of which are
optional.

      Name                            Parameter             Units/Type       Default     Example
        R                         resistance/length            Ω/unit          0.0          0.2
        L                        inductance/length             H/unit          0.0        9.13e-9
        G                       conductance/length            mhos/unit        0.0          0.0
        C                       capacitance/length             F/unit          0.0       3.65e-12
      LEN                           length of line              unit        no default      1.0
       REL                      breakpoint control         arbitrary unit       1           0.5
      ABS                       breakpoint control                              1            5
   NOSTEPLIMIT             don’t limit time-step to less       flag          not set        set
                                   than line delay
   NO CONTROL              don’t do complex time-step          flag          not set       set
                                        control
    LININTERP                use linear interpolation          flag          not set       set
   MIXEDINTERP              use linear when quadratic          flag          not set       set
                                      seems bad
   COMPACTREL                special reltol for history                     RELTOL        1.0e-3
                                     compaction
   COMPACTABS               special abstol for history                      ABSTOL        1.0e-9
                                     compaction
     TRUNCNR             use Newton-Raphson method             flag          not set       set
                               for time-step control
 TRUNCDONTCUT            don’t limit time-step to keep         flag          not set       set
                          impulse-response errors low
The following types of lines have been implemented so far:

    • RLC (uniform transmission line with series loss only),

    • RC (uniform RC line),

    • LC (lossless transmission line),

    • RG (distributed series resistance and parallel conductance only).

Any other combination will yield erroneous results and should not be tried. The length LEN
of the line must be specified. NOSTEPLIMIT is a flag that will remove the default restriction
of limiting time-steps to less than the line delay in the RLC case. NO CONTROL is a flag that
prevents the default limiting of the time-step based on convolution error criteria in the RLC and
RC cases. This speeds up simulation but may in some cases reduce the accuracy of results.
LININTERP is a flag that, when specified, will use linear interpolation instead of the default
quadratic interpolation for calculating delayed signals. MIXEDINTERP is a flag that, when specified,
uses a metric for judging whether quadratic interpolation is not applicable and if so uses
linear interpolation; otherwise it uses the default quadratic interpolation. TRUNCDONTCUT is a
flag that removes the default cutting of the time-step to limit errors in the actual calculation of
impulse-response related quantities. COMPACTREL and COMPACTABS are quantities that control
the compaction of the past history of values stored for convolution. Larger values of these lower
accuracy but usually increase simulation speed. These are to be used with the TRYTOCOMPACT
option, described in the .OPTIONS section. TRUNCNR is a flag that turns on the use of Newton-
Raphson iterations to determine an appropriate time-step in the time-step control routines. The

default is a trial and error procedure by cutting the previous time-step in half. REL and ABS are
quantities that control the setting of breakpoints.
The option most worth experimenting with for increasing the speed of simulation is REL. The
default value of 1 is usually safe from the point of view of accuracy but occasionally increases
computation time. A value greater than 2 eliminates all breakpoints and may be worth trying
depending on the nature of the rest of the circuit, keeping in mind that it might not be safe from
the viewpoint of accuracy.
Breakpoints may usually be entirely eliminated if it is expected the circuit will not display
sharp discontinuities. Values between 0 and 1 are usually not required but may be used for
setting many breakpoints.
COMPACTREL may also be experimented with when the option TRYTOCOMPACT is specified in
a .OPTIONS card. The legal range is between 0 and 1. Larger values usually decrease the
accuracy of the simulation but in some cases improve speed. If TRYTOCOMPACT is not specified
on a .OPTIONS card, history compaction is not attempted and accuracy is high.
NO CONTROL, TRUNCDONTCUT and NOSTEPLIMIT also tend to increase speed at the expense of
accuracy.

## 6.3 Uniform Distributed RC Lines

General form:

        UXXXXXXX n1 n2 n3 mname l=len <n=lumps>

Examples:

        U1 1 2 0 URCMOD L=50U
        .model URCMOD URC CPERL=100p RPERL=100k FMAX=10G

        URC2 1 12 2 UMODL l=1MIL N=6

n1 and n2 are the two element nodes the RC line connects, while n3 is the node the capacitances
are connected to. mname is the model name, len is the length of the RC line in meters. lumps,
if specified, is the number of lumped segments to use in modeling the RC line (see the model
description for the action taken if this parameter is omitted).

### 6.3.1 Uniform Distributed RC Model (URC)

The URC model is derived from a model proposed by L. Gertzberg in 1974. The model is
accomplished by a subcircuit type expansion of the URC line into a network of lumped RC
segments with internally generated nodes. The RC segments are in a geometric progression,
increasing toward the middle of the URC line, with K as a proportionality constant. The number
of lumped segments used, if not specified for the URC line device, is determined by the
following formula:

                                                                 2
                                     log Fmax RL CL 2πL2 (K−1)
                                                           K
                                N=                                                           (6.1)
                                                  log K

The URC line is made up strictly of resistor and capacitor segments unless the ISPERL parameter
is given a nonzero value, in which case the capacitors are replaced with reverse biased diodes
with a zero-bias junction capacitance equivalent to the capacitance replaced, and with a saturation
current of ISPERL amps per meter of transmission line and an optional series resistance
equivalent to RSPERL ohms per meter.

  Name                   Parameter                  Units   Default   Example    Area
    K              Propagation Constant               -       1.5        1.2      -
  FMAX        Maximum Frequency of interest          Hz      1.0 G    6.5 Meg     -
 RPERL           Resistance per unit length         Ω/m      1000        10       -
 CPERL          Capacitance per unit length          F/m    10e-15       1p       -
 ISPERL      Saturation Current per unit length      A/m       0          -       -
 RSPERL          Resistance per unit length         Ω/m        0          -       -

## 6.4 KSPICE Lossy Transmission Lines

Unlike SPICE3, which uses the state-based approach to simulate lossy transmission lines,
KSPICE simulates lossy transmission lines and coupled multiconductor line systems using the
recursive convolution method. The impulse response of an arbitrary transfer function can be
determined by deriving a recursive convolution from the Pade approximations of the function.
ngspice is using this approach for simulating each transmission line’s characteristics and each
multiconductor line’s modal functions. This method of lossy transmission line simulation has
shown to give a sigificant speedup. Please note that the following two models will support only
transient simulation, no ac.

Additional Documentation Available:

    • S. Lin and E. S. Kuh, ‘Pade Approximation Applied to Transient Simulation of Lossy
      Coupled Transmission Lines,’ Proc. IEEE Multi-Chip Module Conference, 1992, pp.
      52-55.

    • S. Lin, M. Marek-Sadowska, and E. S. Kuh, ‘SWEC: A StepWise Equivalent Conduc-
      tance Timing Simulator for CMOS VLSI Circuits,’ European Design Automation Conf.,
      February 1991, pp. 142-148.

    • S. Lin and E. S. Kuh, ‘Transient Simulation of Lossy Interconnect,’ Proc. Design Au-
      tomation Conference, Anaheim, CA, June 1992, pp. 81-86.

### 6.4.1 Single Lossy Transmission Line (TXL)

General form:

        YXXXXXXX N1 0 N2 0 mname <LEN=LENGTH>

Example:

        Y1 1 0 2 0 ymod LEN=2
        .MODEL ymod txl R=12.45 L=8.972e-9 G=0 C=0.468e-12 length=16

n1 and n2 are the nodes of the two ports. The optional instance parameter len is the length of
the line and may be expressed in multiples of [unit]. Typically unit is given in meters. len will
override the model parameter length for the specific instance only.
The TXL model takes a number of parameters:
  Name                   Parameter             Units/Type     Default     Example
    R                resistance/length           Ω/unit         0.0          0.2
    L               inductance/length            H/unit         0.0        9.13e-9
    G              conductance/length           mhos/unit       0.0          0.0
    C              capacitance/length            F/unit         0.0       3.65e-12
 LENGTH                length of line             unit       no default      1.0
Model parameter length must be specified as a multiple of unit. Typically unit is given in [m].
For transient simulation only.

### 6.4.2 Coupled Multiconductor Line (CPL)

The CPL multiconductor line model is in theory similar to the RLGC model, but without frequency
dependent loss (neither skin effect nor frequency-dependent dielectric loss). Up to 8
coupled lines are supported in ngspice.
General form:

        PXXXXXXX NI1 NI2...NIX GND1 NO1 NO2...NOX GND2 mname <LEN=LENGTH>

Example:

        P1 in1 in2 0 b1 b2 0 PLINE
        .model PLINE CPL length={Len}
        +R=1 0 1
        +L={L11} {L12} {L22}
        +G=0 0 0
        +C={C11} {C12} {C22}
        .param Len=1 Rs=0
        + C11=9.143579E-11 C12=-9.78265E-12 C22=9.143578E-11
        + L11=3.83572E-7 L12=8.26253E-8 L22=3.83572E-7

ni1 ... nix are the nodes at port 1 with gnd1; no1 ... nox are the nodes at port 2 with gnd2. The
optional instance parameter len is the length of the line and may be expressed in multiples of
[unit]. Typically unit is given in meters. len will override the model parameter length for the
specific instance only.
The CPL model takes a number of parameters:
  Name                   Parameter             Units/Type     Default     Example
    R                resistance/length           Ω/unit         0.0          0.2
    L               inductance/length            H/unit         0.0        9.13e-9
    G              conductance/length           mhos/unit       0.0          0.0
    C              capacitance/length            F/unit         0.0       3.65e-12
 LENGTH                length of line             unit       no default      1.0
All RLGC parameters are given in Maxwell matrix form. For the R and G matrices the diagonal
elements must be specified, for L and C matrices the lower or upper triangular elements must
specified. The parameter LENGTH is a scalar and is mandatory. For transient simulation only.
