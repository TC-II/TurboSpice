# 4 Voltage and Current Sources

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 4.1 Independent Sources for Voltage or Current

General form:

      VXXXXXXX N+ N- <<DC> DC/TRAN VALUE> <AC <ACMAG <ACPHASE>>>
      + <DISTOF1 <F1MAG <F1PHASE>>> <DISTOF2 <F2MAG <F2PHASE>>>

      IYYYYYYY N+ N- <<DC> DC/TRAN VALUE> <AC <ACMAG <ACPHASE>>>
      + <DISTOF1 <F1MAG <F1PHASE>>> <DISTOF2 <F2MAG <F2PHASE>>>

Examples:

      VCC 10 0 DC 6
      VIN 13 2 0.001 AC 1 SIN(0 1 1MEG)
      ISRC 23 21 AC 0.333 45.0 SFFM(0 1 10K 5 1K)
      VMEAS 12 9
      VCARRIER 1 0 DISTOF1 0.1 -90.0
      VMODULATOR 2 0 DISTOF2 0.01
      IIN1 1 5 AC 1 DISTOF1 DISTOF2 0.001

n+ and n- are the positive and negative nodes, respectively. Note that voltage sources need not
be grounded. Positive current is assumed to flow from the positive node, through the source, to
the negative node. A current source of positive value forces current to flow out of the n+ node,
through the source, and into the n- node. Voltage sources, in addition to being used for circuit
excitation, are the ‘ammeters’ for ngspice, that is, zero valued voltage sources may be inserted
into the circuit for the purpose of measuring current. They of course have no effect on circuit
operation since they represent short-circuits.
DC/TRAN is the dc and transient analysis value of the source. If the source value is zero both for
dc and transient analyses, this value may be omitted. If the source value is time-invariant (e.g.,
a power supply), then the value may optionally be preceded by the letters DC.
The keyword AC together with its value ACMAG (and optional value ACPHASE) are required when
the voltage or current source is intended to become the small signal source in an ac simulation.

ACMAG is the ac magnitude and ACPHASE is the ac phase. The voltage or current source then
will become a reference for all nodes. All small signal node amplitude values obtained after the
simulation have been divided by the reference ACMAG. A typcal ACMAG value thus may be unity.
Any measured phase has been shifted by ACPHASE. If ACPHASE is omitted, a value of zero is
assumed. If the source is not an ac small-signal input, the keyword AC and the ac values are to
be avoided.
DISTOF1 and DISTOF2 are the keywords that specify that the independent source has distortion
inputs at the frequencies F1 and F2 respectively (see the description of the .DISTO control line).
The keywords may be followed by an optional magnitude and phase. The default values of the
magnitude and phase are 1.0 and 0.0 respectively.
Any independent source can be assigned a time-dependent value for transient analysis. If a
source is assigned a time-dependent value, the time-zero value is used for dc analysis. There
are nine independent source functions:

     • pulse,

     • exponential,

     • sinusoidal,

     • piece-wise linear,

     • single-frequency FM,

     • AM,

     • transient noise,

     • random voltages or currents,

     • external data (only with ngspice shared library),

     • and RF port

If parameters other than source values are omitted or set to zero, the default values shown are
assumed. TSTEP is the printing increment and TSTOP is the final time – see the .TRAN control
line for an explanation.

### 4.1.1 Pulse

General form:

        PULSE(V1 V2 TD TR TF PW PER NP)

Examples:

        VIN 3 0 PULSE(-1 1 2NS 2NS 2NS 50NS 100NS 5)

 Name         Parameter           Default Value    Units
  V1         Initial value              -          V, A
  V2        Pulsed value                -          V, A
  TD          Delay time              0.0           sec
  TR          Rise time             TSTEP           sec
  TF           Fall time            TSTEP           sec
  PW         Pulse width            TSTOP           sec
 PER            Period              TSTOP           sec
  NP      Number of Pulses *)      unlimited         -
A single pulse, without repetition count or phase offset, is described by the following table:
     Time             Value
       0               V1
      TD               V1
    TD+TR              V2
  TD+TR+PW             V2
 TD+TR+PW+TF           V1
    TSTOP              V1
Intermediate points are determined by linear interpolation.
*) NP set to 0 or omitted denotes unlimited pulses. If compatibility mode (see 12.11.1) set ngbehavior=xs
is set in .spiceinit, the 8th parameter is the phase of the pulse signal (in degrees),
which results in forward running (pos. value) or a delay (neg. value) of the pulse sequence.

### 4.1.2 Sinusoidal

General form:

        SIN(VO VA FREQ TD THETA PHASE)

Examples:

        VIN 3 0 SIN(0 1 100MEG 1NS 1E10)

  Name        Parameter        Default Value     Units
   VO           Offset               -           V, A
   VA         Amplitude              -           V, A
  FREQ        Frequency          1/T ST OP        Hz
   TD           Delay               0.0           sec
 THETA      Damping factor          0.0          1/sec
 PHASE          Phase               0.0         degrees
The shape of the waveform is described by the following formula:

        (
         V0                                                          if 0 ≤ t < T D
V (t) =           −(t−T D)T HETA
         V 0 +VA e               sin (2π · FREQ · (t − T D) + PHASE) if T D ≤ t < T ST OP.
                                                                                      (4.1)

### 4.1.3 Exponential

General form:

        EXP(V1 V2 TD1 TAU1 TD2 TAU2)

Examples:

        VIN 3 0 EXP(-4 -1 2NS 30NS 60NS 40NS)

 Name          Parameter        Default Value     Units
   V1         Initial value           -           V, A
   V2        pulsed value             -           V, A
  TD1       rise delay time         0.0            sec
 TAU1     rise time constant      TSTEP            sec
  TD2       fall delay time     TD1+TSTEP          sec
 TAU2     fall time constant      TSTEP            sec
The shape of the waveform is described by the following formula:
Let V 21 = V 2 −V 1,V 12 = V 1 −V 2:

            
            
            V1                                           if 0 ≤ t < T D1,
                              (t−T D1)
                                     
                            −
     V (t) = V 1 +V 21 1 − e TAU1                         if T D1 ≤ t < T D2,                   (4.2)
                              (t−T D1)         (t−T D2)
                                                    
            V 1 +V 21 1 − e− TAU1 +V 12 1 − e− TAU2
            
                                                          if T D2 ≤ t < T ST OP.

### 4.1.4 Piece-Wise Linear

General form:

        PWL(T1 V1 <T2 V2 T3 V3 T4 V4 ...>) <r=value> <td=value>

Examples:

        VCLOCK 7 5 PWL(0 -7 10NS -7 11NS -3 17NS -3 18NS -7 50NS -7)
        + r=0 td=15NS

Each pair of values (Ti , Vi ) specifies that the value of the source is Vi (in Volts or Amps) at
time = Ti . The value of the source at intermediate values of time is determined by using linear
interpolation on the input values. The parameter r determines a repeat time point. If r is set to
-1 or is not given, the whole sequence of values (Ti , Vi ) is issued once only, then the output stays
at its final value. If r = 0, the whole sequence from time 0 to time Tn is repeated forever. If r =
10ns, the sequence between 10ns and 50ns is repeated forever. The r value has to be one of the
time points T1 to T(n-1) of the PWL sequence, not the last point Tn. If td is given, the whole
PWL sequence is delayed by the value of td. Please note that for now r and td are available only
with the voltage source, not with the current source.

### 4.1.5 Single-Frequency FM

General Form:

        SFFM(VO VA FC MDI FM TD PHASEM PHASEC)

Examples:

        V1 12 0 SFFM(0 2 20 45 1k 1m 0 0)

  Name               Parameter          Default value    Units
   VO                  Offset                 -          V, A
   VA               Amplitude                 -          V, A
   FC            Carrier frequency       500/T ST OP      Hz
   MDI           Modulation index            90
   FM          Modulating frequency       5/T ST OP       Hz
   TD              Signal delay              0.0           s
 PHASEM       Modulation signal phase        0.0        degrees
 PHASEC         Carrier signal phase         0.0        degrees

The shape of the waveform is described by the following equation:

  V (t) = VO +VA ·
         sin (2π · FC · (t − T D) + MDI sin (2π · FM · (t − T D) + PHASEM) + PHASEC) (4.3)

with t > T D, else V (t) = 0.

MDI is limited to 0 <= MDI <= FC/FM. VO and VA have to be given always.

### 4.1.6 Amplitude modulated source (AM)

General form:

        AM(VO VMO VMA FM FC TD PHASEM PHASEC)

Examples:

        V1 12 0 AM(0.5 2 1.8 20K 5MEG 1m)

  Name                Parameter               Default value    Units
   VO               Overall offset                  -          V, A
  VMO          Modulation signal offset             -          V, A
  VMA         Modulation signal amplitude           1          V, A
   FM         Modulation signal frequency       5/T ST OP       Hz
   FC          Carrier signal frequency        500/T ST OP      Hz
   TD               Overall delay                  0.0           s
 PHASEM        Modulation signal phase             0.0        degrees
 PHASEC          Carrier signal phase              0.0        degrees
The shape of the waveform is described by the following equation:

  V (t) = VO + (V MO +V MA · sin (2π · FM · (t − T D) + PHASEM)) ·
                                                    sin (2π · FC · (t − T D) + PHASEC) (4.4)

with t > T D, else V (t) = 0.
VO and VMO have to be given always.
With the modulation depth, given by V MA/V MO, varied between 0 and 1, a standard amplitude
modulated signal is provided. VMO then also acts as overall multiplier to the signal. On the
other hand one may set VMO to 0, then obtaining a signal with double side band and suppressed
carrier.

### 4.1.7 Transient noise source

General form:

        TRNOISE(NA NT NALPHA NAMP RTSAM RTSCAPT RTSEMT)

Examples:

        VNoiw 1 0 DC 0 TRNOISE(20n 0.5n 0 0)      $ white
        VNoi1of 1 0 DC 0 TRNOISE(0 10p 1.1 12p)   $ 1/f
        VNoiw1of 1 0 DC 0 TRNOISE(20 10p 1.1 12p) $ white and 1/f
        IALL 10 0 DC 0 trnoise(1m 1u 1.0 0.1m 15m 22u 50u)
                                                  $ white, 1/f, RTS

Transient noise is an experimental feature allowing (low frequency) transient noise injection and
analysis. See Chapt. 11.3.11 for a detailed description. NA is the Gaussian noise rms voltage
amplitude, NT is the time between sample values (breakpoints will be enforced on multiples of
this value). NALPHA (exponent to the frequency dependency), NAMP (rms voltage or current amplitude)
are the parameters for 1/f noise, RTSAM the random telegraph signal amplitude, RTSCAPT
the mean of the exponential distribution of the trap capture time, and RTSEMT its emission time
mean. White Gaussian, 1/f, and RTS noise may be combined into a single statement.

   Name                   Parameter                 Default value    Units
    NA          Rms noise amplitude (Gaussian)           -           V, A
    NT                    Time step                      -            sec
 NALPHA                  1/f exponent                0<α <2            -
  NAMP                 Amplitude (1/f)                   -           V, A
  RTSAM                   Amplitude                      -           V, A
 RTSCAPT              Trap capture time                  -            sec
 RTSEMT              Trap emission time                  -            sec
If you set NT and RTSAM to 0, the noise option TRNOISE ... is ignored. Thus you may switch off
the noise contribution of an individual voltage source VNOI by the command
alter @vnoi[trnoise] = [ 0 0 0 0 ] $ no noise

alter @vrts[trnoise] = [ 0 0 0 0 0 0 0] $ no noise

See Chapt. 13.5.3 for the alter command.
You may switch off all TRNOISE noise sources by setting
set notrnoise

to your .spiceinit file (for all your simulations) or into your control section in front of the next
run or tran command (for this specific and all following simulations). The command
unset notrnoise

will reinstate all noise sources.
The noise generators are implemented into the independent voltage (vsrc) and current (isrc)
sources.

### 4.1.8 Random voltage source

The TRRANDOM option yields statistically distributed voltage values, derived from the ngspice
random number generator. These values may be used in the transient simulation directly within
a circuit, e.g. for generating a specific noise voltage, but especially they may be used in the control
of behavioral sources (B, E, G sources 5, voltage controllable A sources 8, capacitors 3.3.9,
inductors 3.3.13, or resistors 3.3.4) to simulate the circuit dependence on statistically varying
device parameters. A Monte-Carlo simulation may thus be handled in a single simulation run.
General form:

        TRRANDOM(TYPE TS <TD <PARAM1 <PARAM2>>>)

Examples:

        VR1 r1 0 dc 0 trrandom (2 10m 0 1) ; Gaussian with mean 0
        V1 1 0 dc 0 trrandom (1 1u 0.5u 0.5 0.5) ; Uniform between 0 and 1

TYPE determines the random variates generated: 1 is uniformly distributed, 2 Gaussian, 3 exponential,
4 Poisson. TS is the duration of an individual voltage value. TD is a time delay with the
output staying at the Offset or Mean value, before the random voltage values start up.
PARAM1 and PARAM2 depend on the type selected. The uniform distribution issues values in the
range of ±PARAM1 around the offset PARAM2. The Gaussian distribution issues values with the
standard deviation of PARAM1 around the mean PARAM2.
  TYPE description          PARAM1        default    PARAM2 default
    1      Uniform            Range          1        Offset        0
    2      Gaussian       Standard Dev.      1         Mean         0
    3     Exponential          Mean          1        Offset        0
    4       Poisson          Lambda          1        Offset        0

### 4.1.9 External voltage or current input

General form:

        EXTERNAL

Examples:

        Vex 1 0 dc 0 external
        Iex i1 i2 dc 0 external <m = xx>

Voltages or currents may be set from the calling process, if ngspice is compiled as a shared
library and loaded by the process. See Chapter 15 and 15.3.3.11 for an explanation.

### 4.1.10 Arbitrary Phase Sources

ngspice supports arbitrary phase independent sources that output at TIME=0.0 a value corresponding
to some specified phase shift. Other versions of SPICE use the TD (delay time)
parameter to set phase-shifted sources to their time-zero value until the delay time has elapsed.
The ngspice phase parameter is specified in degrees and is included after the SPICE3 parameters
normally used to specify an independent source. Partial examples of usage for pulse and
sine waveforms are shown below:

        * Phase shift is specified as final parameter
        * on the independent source cards. Phase shift for both of the
        * following is specified as +45 degrees
        *
        v1 1 0 0.0 sin(0 1 1k 0 0 45.0)
        r1 1 0 1k
        *
        v2 2 0 0.0 pulse(-1 1 0 1e-5 1e-5 5e-4 1e-3 45.0)
        r2 2 0 1k
        *

### 4.1.11 RF Port

A voltage source VSRC may be defined as RF Port. To do so, there are at least two more
parameters required. The first is portnum (integer) which defines the VSRC as a RF Port.
Portnum of all VSRCs defined as RF ports must start from 1 and count up to the number of RF
ports. You cannot have duplicate portnums. Then you have Z0 (real) which defines the internal
impedance. If not provided, its default value is 50Ohm. When declaring a RF ports, the VSRC
now become a VSRC with Z0 Ohm in series. This extra resistor affects all simulations.
General form:

        DC 0 AC 1 portnum n1 <z0 n2>

Examples:

        V1 in 0 dc 0 ac 1 portnum 1 z0 100

At least two ports are required for the S-parameter simulation with the command .sp (11.3.8).
If portnum is not provided, the voltage source VRSC behaves as normal.

## 4.2 Linear Dependent Sources

Ngspice allows circuits to contain linear dependent sources characterized by any of the four
equations
 i = gv    v = ev   i = fi   v = hi
where g, e, f , and h are constants representing transconductance, voltage gain, current gain,
and transresistance, respectively. Non-linear dependent sources for voltages or currents (B, E,
G) are described in Chapt. 5.

### 4.2.1 Gxxxx: Linear Voltage-Controlled Current Sources (VCCS)

General form:

        GXXXXXXX N+ N- NC+ NC- VALUE <m=val>

Examples:

        G1 2 0 5 0 0.1

n+ and n- are the positive and negative nodes, respectively. Current flow is from the positive
node, through the source, to the negative
node. nc+ and nc- are the positive and negative controlling nodes, respectively. value is the
transconductance (in mhos). m is an optional multiplier to the output current. val may be a
numerical value or an expression according to 2.11.5 containing references to other parameters.
Instance parameters are listed in chapt. 27.3.6.

### 4.2.2 Exxxx: Linear Voltage-Controlled Voltage Sources (VCVS)

General form:

        EXXXXXXX N+ N- NC+ NC- VALUE

Examples:

        E1 2 3 14 1 2.0

n+ is the positive node, and n- is the negative node. nc+ and nc- are the positive and negative
controlling nodes, respectively. value is the voltage gain. Instance parameters are listed in
chapt. 27.3.7.

### 4.2.3 Fxxxx: Linear Current-Controlled Current Sources (CCCS)

General form:

        FXXXXXXX N+ N- VNAM VALUE <m=val>

Examples:

        F1 13 5 VSENS 5 m=2

n+ and n- are the positive and negative nodes, respectively. Current flow is from the positive
node, through the source, to the negative node. vnam is the name of a voltage source through
which the controlling current flows. The direction of positive controlling current flow is from
the positive node, through the source, to the negative node of vnam. value is the current gain.
m is an optional multiplier to the output current. Instance parameters are listed in chapt. 27.3.4.

### 4.2.4 Hxxxx: Linear Current-Controlled Voltage Sources (CCVS)

General form:

        HXXXXXXX N+ N- VNAM VALUE

Examples:

        HX 5 17 VZ 0.5K

n+ and n- are the positive and negative nodes, respectively. vnam is the name of a voltage source
through which the controlling current flows. The direction of positive controlling current flow
is from the positive node, through the source, to the negative node of vnam. value is the
transresistance (in ohms). Instance parameters are listed in chapt. 27.3.5.

### 4.2.5 Polynomial Source Compatibility

Dependent polynomial sources available in SPICE2G6 are fully supported in ngspice using the
XSPICE extension (21.1). The form used to specify these sources is shown in Table 4.1. For
details on its usage please see Chapt. 5.5.

                               Dependent Polynomial Sources
 Source Type              Instance Card
 POLYNOMIAL VCVS          EXXXXXXX N+ N- POLY(ND) NC1+ NC1- P0 (P1...)
 POLYNOMIAL VCCS          GXXXXXXX N+ N- POLY(ND) NC1+ NC1- P0 (P1...)
 POLYNOMIAL CCCS          FXXXXXXX N+ N- POLY(ND) VNAM1 !VNAM2...? P0 (P1...)
 POLYNOMIAL CCVS          HXXXXXXX N+ N- POLY(ND) VNAM1 !VNAM2...? P0 (P1...)
                         Table 4.1: Dependent Polynomial Sources
