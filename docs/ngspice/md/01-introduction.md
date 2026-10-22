# 1 Introduction

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Ngspice is a general-purpose circuit simulation program for nonlinear and linear analyses. Circuits
may contain resistors, capacitors, inductors, mutual inductors, independent or dependent
voltage and current sources, loss-less and lossy transmission lines, switches, uniform distributed
RC lines, and the five most common semiconductor devices: diodes, BJTs, JFETs, MESFETs,
and MOSFETs.
The most common way to use Ngspice is to start it from the OS command prompt, passing the
name of a netlist file: one containing the definition of a circuit. The largest part of this manual
is the description of such files. For a full description of starting options see Chapter 12. Input
files may also contain scripts written in Ngspice’s command language (13). Interactive user
interfaces are described in Chapter 14.
Some introductory remarks on how to use ngspice may be found in Chapter 17.
Ngspice is an update of Spice3f5, the last Berkeley’s release of Spice3 simulator family. Ngspice
is being developed to include new features to existing Spice3f5 and to fix its bugs. Improving
a complex software like a circuit simulator is a very hard task and, while some improvements
have been made, most of the work has been done on bug fixing and code refactoring.
Ngspice has built-in models for the semiconductor devices, and the user need specify only the
pertinent model parameter values.
Ngspice supports mixed-level simulation and provides a direct link between technology parameters
and circuit performance. A mixed-level circuit and device simulator can provide greater
simulation accuracy than a stand-alone circuit or device simulator by numerically modeling the
critical devices in a circuit. Compact models can be used for all other devices. The mixedlevel
extensions to ngspice is CIDER, a mixed-level circuit and device simulator integrated into
ngspice code.
Ngspice supports mixed-signal simulation through the integration of XSPICE code. XSPICE
software, developed as an extension to Spice3C1 by GeorgiaTech, has been enhanced and ported
to ngspice to provide ‘board’ level and mixed-signal simulation. Digital Verilog modules, compiled
with Verilator or Icarus Verilog, can be attached. Communication with (C coded) processes
via pipes may be established.
The XSPICE extension enables pure digital simulation as well.
New devices can be added to ngspice by several means: behavioral B-, E- or G-sources, the
XSPICE code-model interface for C-like device coding, and Verilog-A models, when compiled
with OpenVAF, via the OSDI interface.

Finally, numerous small bugs have been discovered and fixed, and the program has been ported
to a wider variety of computing platforms.

## 1.1 Simulation Algorithms

Computer-based circuit simulation is often used as a tool by designers, test engineers, and
others who want to analyze the operation of a design without examining the physical circuit.
Simulation allows you to change quickly the parameters of many of the circuit elements to
determine how they affect the circuit response. Often it is difficult or impossible to change
these parameters in a physical circuit.
However, to be practical, a simulator must execute in a reasonable amount of time. The key to
efficient execution is choosing the proper level of modeling abstraction for a given problem. To
support a given modeling abstraction, the simulator must provide appropriate algorithms.
Historically, circuit simulators have supported either an analog simulation algorithm or a digital
simulation algorithm. Ngspice inherits the XSPICE framework and supports both analog and
digital algorithms and is a ‘mixed-mode’ simulator.

### 1.1.1 Analog Simulation

Analog simulation focuses on the linear and non-linear behavior of a circuit over a continuous
time or frequency interval. The circuit response is obtained by iteratively solving Kirchhoff’s
Laws for the circuit at time steps selected to ensure the solution has converged to a stable value
and that numerical approximations of integrations are sufficiently accurate. Since Kirchhoff’s
laws form a set of simultaneous equations, the simulator operates by solving a matrix of equations
at each time point. This matrix processing generally results in slower simulation times
when compared to digital circuit simulators.
The response of a circuit is a function of the applied sources. Ngspice offers a variety of
source types including DC, sine-wave, and pulse. In addition to specifying sources, the user
must define the type of simulation to be run. This is termed the ‘mode of analysis’. Analysis
modes include DC analysis, AC analysis, and transient analysis. For DC analysis, the timevarying
behavior of reactive elements is neglected and the simulator calculates the DC solution
of the circuit. Swept DC analysis may also be accomplished with ngspice. This is simply the
repeated application of DC analysis over a range of DC levels for the input sources. For AC
analysis, the simulator determines the response of the circuit, including reactive elements to
small-signal sinusoidal inputs over a range of frequencies. The simulator output in this case
includes amplitudes and phases as a function of frequency. For transient analysis, the circuit
response, including reactive elements, is analyzed to calculate the behavior of the circuit as a
function of time.

### 1.1.2 Matrix solvers

Since version 42 ngspice offers two matrix solvers. Spice3f5 originally has used the solver
Sparse 1.3, which has proven to be robust for all simulation tasks [26]. It is especially suited
for simulating behavioral models. Optionally, to speed up the simulation of large circuits with
thousands of transistors, the KLU matrix solver [27, 28] may be selected (see chapter 11.1.1).

### 1.1.3 Device Models for Analog Simulation

There are three models for bipolar junction transistors, all based on the integral-charge model
of Gummel and Poon; however, if the Gummel-Poon parameters are not specified, the basic
model (BJT) reduces to the simpler Ebers-Moll model. In either case and in either model,
charge storage effects, ohmic resistances, and a current-dependent output conductance may be
included. The second bipolar model BJT2 adds dc current computation in the substrate diode.
The third model (VBIC) contains further enhancements for advanced bipolar devices.
The semiconductor diode model can be used for either junction diodes or Schottky barrier
diodes. There are two models for JFET: the first (JFET) is based on the model of Shichman
and Hodges, the second (JFET2) is based on the Parker-Skellern model. All the original six
MOSFET models are implemented: MOS1 is described by a square-law I-V characteristic,
MOS2 [28] is an analytical model, while MOS3 [28] is a semi-empirical model; MOS6 [2] is a
simple analytic model accurate in the short channel region; MOS9, is a slightly modified Level
3 MOSFET model - not to confuse with Philips level 9; BSIM 1 [3, 4]; BSIM2 [5] are the
old BSIM (Berkeley Short-channel IGFET Model) models. MOS2, MOS3, and BSIM include
second-order effects such as channel-length modulation, subthreshold conduction, scatteringlimited
velocity saturation, small-size effects, and charge controlled capacitances. The recent
MOS models for submicron devices are the BSIM3 (Berkeley BSIM3 web page) and BSIM4
(Berkeley BSIM4 web page) models. Silicon-on-insulator MOS transistors are described by
the SOI models from the BSIMSOI family (Berkeley BSIMSOI web page) and the STAG [18]
model. There is some support for a couple of HFET models and one model for MESA devices.
Verilog-A models are made available via the OpenVAF/OSDI interface (see chapter 9).

### 1.1.4 Digital Simulation

Digital circuit simulation differs from analog circuit simulation in several respects. A primary
difference is that a solution of Kirchhoff’s laws is not required. Instead, the simulator must only
determine whether a change in the logic state of a node has occurred and propagate this change
to connected elements. Such a change is called an ‘event’.
When an event occurs, the simulator examines only those circuit elements that are affected by
the event. As a result, matrix analysis is not required in digital simulators. By comparison,
analog simulators must iteratively solve for the behavior of the entire circuit because of the
forward and reverse transmission properties of analog components. This difference results in
a considerable computational advantage for digital circuit simulators, which is reflected in the
significantly greater speed of digital simulations.

### 1.1.5 Mixed-Signal Simulation

Modern circuits often contain a mix of analog and digital circuits. To simulate such circuits
efficiently and accurately, a mix of analog and digital simulation techniques is required. When
analog simulation algorithms are combined with digital simulation algorithms, the result is
termed ‘mixed-mode simulation’.
Two basic methods of implementing mixed-mode simulation used in practice are the ‘native
mode’ and ‘glued mode’ approaches. Native mode simulators implement both an analog algorithm
and a digital algorithm in the same executable. Glued mode simulators actually use two

simulators, one of which is analog and the other digital. This type of simulator must define an
input/output protocol so that the two executables can communicate with each other effectively.
The communication constraints tend to reduce the speed, and sometimes the accuracy, of the
complete simulator. On the other hand, the use of a glued mode simulator allows the component
models developed for the separate executables to be used without modification.
Ngspice is a native mode simulator providing both analog and event-based simulation in the
same executable. The underlying algorithms of ngspice (coming from XSPICE and its Code
Model Subsystem) allow use of all the standard SPICE models, provide a pre-defined collection
of the most common analog and digital functions, and provide an extensible base on which to
build additional models.

#### 1.1.5.1 User-Defined Nodes

Ngspice supports creation of ‘User-Defined Node’ types. User-Defined Node types allow you
to specify nodes that propagate data other than voltages, currents, and digital states. Like digital
nodes, User-Defined Nodes use event-driven simulation, but the state value may be an arbitrary
data type. A simple example application of User-Defined Nodes is the simulation of a digital
signal processing filter algorithm. In this application, each node could assume a real or integer
value. More complex applications may define types that involve complex data such as digital
data vectors or even non-electronic data.
Ngspice digital simulation is actually implemented as a special case of this User-Defined Node
capability where the digital state is defined by a data structure that holds a Boolean logic state
and a strength value.

### 1.1.6 Mixed-Level Simulation (Electronic and TCAD)

Ngspice implements mixed-level simulation through the merging of its code with CIDER (details
see Chapt. 26).
CIDER is a mixed-level circuit and device simulator that provides a direct link between technology
parameters and circuit performance. A mixed-level circuit and device simulator can
provide greater simulation accuracy than a stand-alone circuit or device simulator by numerically
modeling the critical devices in a circuit. Compact models can be used for noncritical
devices.
CIDER couples ngspice to a internal C-based device simulator, thus providing circuit analyses,
compact models for semiconductor devices, and an interactive user interface. CIDER provides
accurate, one- and two-dimensional numerical device models based on the solution of Poisson’s
equation, and the electron and hole current-continuity equations. CIDER incorporates many of
the same basic physical models found in the the Stanford two-dimensional device simulator
PISCES [PINT85]. Input to CIDER consists of a SPICE-like description of the circuit and
its compact models, and PISCES-like descriptions of the structures of numerically modeled
devices. As a result, CIDER should seem familiar to designers already accustomed to these two
tools.
The CIDER input format has great flexibility and allows increased access to physical model parameters.
New physical models have been added to allow simulation of state-of-the-art devices.
These include transverse field mobility degradation [GATE90] that is important in scaled-down

MOSFETs and a polysilicon model for poly-emitter bipolar transistors. Temperature dependence
has been included for most physical models over the range from -50°C to 150°C. The
numerical models can be used to simulate all the basic types of semiconductor devices: resistors,
MOS capacitors, diodes, BJTs, JFETs and MOSFETs. BJTs and JFETs can be modeled
with or without a substrate contact. Support has been added for the management of device
internal states. Post-processing of device states can be performed using the control language
user interface of ngspice. Previously computed states can be loaded into the program to provide
accurate initial guesses for subsequent analyses.
Details of the basic semiconductor equations and the physical models used by CIDER are not
provided in this manual. Unfortunately, no other single source exists that describes all of the
relevant background material. Comprehensive reviews of device simulation can be found in
[PINT90] and the book [SELB84]. CODECS (predecessor to CIDER) and its inversion-layer
mobility model are described in [MAYA88] and [LGATE90], respectively. PISCES and its
models are described in [PINT85]. Temperature dependencies for the PISCES models used by
CIDER are available in [SOLL90].
For Linux users the cooperation of the TCAD software GSS with ngspice might be of interest,
see https://ngspice.sourceforge.io/gss.html. This project is no longer maintained however, but
has moved into the Genius simulator, still available as open source cogenda genius.

## 1.2 Supported Analyses

The ngspice simulator supports the following different types of analysis:

   1. DC Analysis (Operating Point and DC Sweep) (11.3.2 and 11.3.5)

   2. AC Small-Signal Analysis (11.3.1)

   3. Transient Analysis (11.3.10)

   4. Pole-Zero Analysis (11.3.6)

   5. Small-Signal Distortion Analysis (11.3.3)

   6. Sensitivity Analysis (11.3.7)

   7. Noise Analysis (11.3.4)

The different types of analysis are described below, the cross-references above are to the netlist
directives used to request them. Applications that are exclusively analog can make use of all
analysis modes with the exception of the Code Model subsystem that does not implement Pole-
Zero, Distortion, Sensitivity and Noise analyses. Event-driven applications that include digital
and User-Defined Node types may make use of DC (operating point and DC sweep) and Transient
only.
In order to understand the relationship between the different analyses and the two underlying
simulation algorithms of ngspice, it is important to understand what is meant by each analysis
type. This is detailed below.

### 1.2.1 DC Analysis

The DC analysis portion of ngspice determines the dc operating point of the circuit with inductors
shorted and capacitors opened. DC analysis options are specified on the .DC, .TF, and .OP
control lines.
DC analysis does not consider any time dependence on any of the sources within the system
description. The simulator algorithm subdivides the circuit into those portions that require the
analog simulator algorithm and those that require the event-driven algorithm. Each subsystem
block is then iterated to solution, with the interfaces between analog nodes and event-driven
nodes iterated for consistency across the entire system.
Once stable values are obtained for all nodes in the system, the analysis halts and the results
may be displayed or printed out as you request them.
A dc analysis is automatically performed prior to a transient analysis to determine the transient
initial conditions, and prior to an ac small-signal analysis to determine the linearized,
small-signal models for nonlinear devices. If requested, the DC small-signal value of a transfer
function (ratio of output variable to input source), input resistance, and output resistance is also
computed as a part of the DC solution. DC analysis can also be used to generate DC transfer
curves: a specified independent voltage, current source, resistor or temperature is stepped over
a user-specified range and the DC output variables are stored for each sequential source value.

### 1.2.2 AC Small-Signal Analysis

AC analysis is limited to analog nodes and represents the small signal, sinusoidal solution of the
analog system described at a particular frequency or set of frequencies. This analysis is similar
to the DC analysis in that it represents the steady-state behavior of the described system with a
single input node at a given set of stimulus frequencies.
The program first computes the dc operating point of the circuit and determines linearized,
small-signal models for all of the nonlinear devices in the circuit. The resultant linear circuit
is then analyzed over a user-specified range of frequencies. The desired output of an ac smallsignal
analysis is usually a transfer function (voltage gain, transimpedance, etc). If the circuit
has only one ac input, it is convenient to set that input to unity and zero phase, so that output
variables have the same value as the transfer function of the output variable with respect to the
input.

### 1.2.3 Transient Analysis

Transient analysis is an extension of DC analysis to the time domain. A transient analysis first
obtains a DC solution to provide a point of departure for simulating time-varying behavior.
Once the DC solution is obtained, the time-dependent aspects of the system are reintroduced,
and the two simulator algorithms incrementally solve for the time varying behavior of the entire
system. Inconsistencies in node values are resolved by the two simulation algorithms such that
the time-dependent waveforms created by the analysis are consistent across the entire simulated
time interval. Resulting time-varying descriptions of node behavior for the specified time
interval are accessible to you.
All sources that are not time dependent (for example, power supplies) are set to their dc value.
The transient time interval is specified on a .TRAN control line.

### 1.2.4 Pole-Zero Analysis

Pole-zero analysis in ngspice computes the poles and/or zeros in the small-signal ac transfer
function. Ngspice first computes the dc operating point and then determines the linearized,
small-signal models for all the nonlinear devices in the circuit. The small-signal circuit model
is then used to find the poles and zeros of the transfer function. Two types of transfer functions
are allowed: one of the form (output voltage)/(input voltage) and the other of the form (output
voltage)/(input current). These two types of transfer functions cover all the cases and one can
find the poles/zeros of functions like input/output impedance and voltage gain. The input and
output ports are specified as two pairs of nodes. The pole-zero analysis works with resistors,
capacitors, inductors, linear-controlled sources, independent sources, BJTs, MOSFETs, JFETs
and diodes. Transmission lines are not supported.
The method used in the analysis is a sub-optimal numerical search. For large circuits it may
take a considerable time or fail to find all poles and zeros. Please note, that for some circuits,
the method becomes “lost” and may find an excessive number of poles or zeros.

### 1.2.5 Small-Signal Distortion Analysis

Distortion analysis in ngspice computes steady-state harmonic and intermodulation products
for small input signal magnitudes. If signals of a single frequency are specified as the input to
the circuit, the complex values of the second and third harmonics are determined at every point
in the circuit. If there are signals of two frequencies input to the circuit, the analysis finds out
the complex values of the circuit variables at the sum and difference of the input frequencies,
and at the difference of the smaller frequency from the second harmonic of the larger frequency.
Distortion analysis is supported for the following nonlinear devices:

    • Diodes (DIO),

    • BJT,

    • JFET (level 1),

    • MOSFETs (levels 1, 2, 3, 9, and BSIM1),

    • MESFET (level 1).

All linear devices are automatically supported by distortion analysis. If there are switches
present in the circuit, the analysis continues to be accurate provided the switches do not change
state under the small excitations used for distortion calculations.
If a device model does not support direct small signal distortion analysis, please use the Fourier
of FFT statements and evaluate the output per scripting.

### 1.2.6 Sensitivity Analysis

Ngspice can calculate either the DC operating-point sensitivity or the AC small-signal sensitivity
of an output variable with respect to all circuit variables, including model parameters.
Ngspice calculates the difference in an output variable (either a node voltage or a branch current)

by perturbing each parameter of each device independently. Since the method is a numerical
approximation, the results may demonstrate second order effects in highly sensitive parameters,
or may fail to show very low but non-zero sensitivity.
Since each variable is perturbed by a small fraction of its value, zero-valued parameters are not
analyzed, reducing what is usually a very large amount of data.

### 1.2.7 Noise Analysis

Noise analysis in ngspice measures the device-generated noise for a given circuit. When provided
with an input source and an output port, the analysis calculates the noise contributions of
each device, and each noise generator within each device, as measured as a voltage at the output
port. Noise analysis also calculates the equivalent input noise of the circuit, based on the output
noise. This is done for every frequency point in a specified range - the calculated value of the
noise corresponds to the spectral density of the circuit variable viewed as a stationary Gaussian
stochastic process. After calculating the spectral densities, noise analysis integrates these
values over the specified frequency range to arrive at the total noise voltage and current over
this frequency range. The calculated values correspond to the variance of the circuit variables
viewed as stationary Gaussian processes.

### 1.2.8 Periodic Steady State Analysis

Experimental code.
PSS is a radio frequency periodical large-signal dedicated analysis. The implementation is
based on a time domain shooting method that make use of transient analysis. As it is in early
development stage, PSS performs analysis only on autonomous circuits, meaning that it is able
to predict fundamental frequency and (harmonic) amplitude(s) for oscillators, VCOs, etc.. The
algorithm is based on a search of the minimum error vector defined as the difference of RHS
vectors between two occurrences of an estimated period. Convergence is reached when the
mean of this error vector decreases below a given threshold parameter. Results of PSS are the
basis of periodical large-signal analyses like PAC or PNoise.

## 1.3 Analysis at Different Temperatures

### 1.3.1 Introduction

Temperature, in ngspice, is a property associated to the entire circuit, rather than an analysis option.
Circuit temperature has a default (nominal) value of 27°C (300.15 K) that can be changed
using the TEMP option in an .option control line (see 11.1.1) or by the .TEMP line (see 2.14),
which has precedence over the .option TEMP line. All analyses are, thus, performed at circuit
temperature, and if you want to simulate circuit behavior at different temperatures you should
prepare a netlist for each temperature.
All input data for ngspice is assumed to have been measured at the circuit nominal temperature.
This value can further be overridden for any device that models temperature effects by
specifying the TNOM parameter on the .model itself. Individual instances may further override

the circuit temperature through the specification of TEMP and DTEMP parameters on the instance.
The two options are not independent even if you can specify both on the instance line, the TEMP
option overrides DTEMP. The algorithm to compute instance temperature is described below:

Algorithm 1.1 Instance temperature computation
 IF TEMP is specified THEN
 instance_temperature = TEMP
 ELSE
 instance_temperature = circuit_temperature + DTEMP
 END IF

Temperature dependent support is provided for all devices except voltage and current sources
(either independent and controlled) and BSIM models. BSIM MOSFETs have an alternate
temperature dependency scheme that adjusts all of the model parameters before input to ngspice.
For details of the BSIM temperature adjustment, see [6] and [7]. Temperature appears explicitly
in the exponential terms of the BJT and diode model equations. In addition, saturation currents
have a built-in temperature dependence. The temperature dependence of the saturation current
in the BJT models is determined by:
                                                XT I                         
                                            T1                Eg q (T1 − T0 )
                        IS (T1 ) = IS (T0 )               exp                                (1.1)
                                            T0                   k (T1 T0 )
where k is Boltzmann’s constant, q is the electronic charge, Eg is the energy gap model parameter,
and XT I is the saturation current temperature exponent (also a model parameter, and
usually equal to 3).
The temperature dependence of forward and reverse beta is according to the formula:
                                                               XT B
                                                      T1
                                    B (T1 ) = B (T0 )                                        (1.2)
                                                      T0
where T0 and T1 are in degrees Kelvin, and XT B is a user-supplied model parameter. Temperature
effects on beta are carried out by appropriate adjustment to the values of BF , ISE , BR , and
ISC (SPICE model parameters BF, ISE, BR, and ISC, respectively).
Temperature dependence of the saturation current in the junction diode model is determined by:

                                                 XT I                        
                                            T1      N         Eg q (T1 − T0 )
                        IS (T1 ) = IS (T0 )               exp                                (1.3)
                                            T0                 Nk (T1 T0 )
where N is the emission coefficient model parameter, and the other symbols have the same
meaning as above. Note that for Schottky barrier diodes, the value of the saturation current
temperature exponent, XT I, is usually 2. Temperature appears explicitly in the value of junction
potential, U (in Ngspice PHI), for all the device models.
The temperature dependence is determined by:
                                                                      !
                                            kT                Na Nd
                                   U (T ) =    ln                                            (1.4)
                                             q             Ni (T )2

where k is Boltzmann’s constant, q is the electronic charge, Na is the acceptor impurity density,
Nd is the donor impurity density, Ni is the intrinsic carrier concentration, and Eg is the
energy gap. Temperature appears explicitly in the value of surface mobility, M0 (or U0 ), for the
MOSFET model.
The temperature dependence is determined by:

                                                 M0 (T0 )
                                       M0 (T ) =  1.5                                     (1.5)
                                                   T
                                                   T0

The effects of temperature on resistors, capacitor and inductors is modeled by the formula:
                                      h                                   i
                      R (T ) = R (T0 ) 1 + TC1 (T − T0 ) + TC2 (T − T0 )2                   (1.6)

where T is the circuit temperature, T0 is the nominal temperature, and TC1 and TC2 are the first
and second order temperature coefficients.

### 1.3.2 Controlling the temperature

The default temperature is set to 27 °C.

        .temp 40

will set the overall temperature to 40 °C (2.14). The command

        .options temp=60

will set the overall temperature to 60 °C (11.1.1). Both commands are equivalent, however
.temp will override .options temp.

The temperature of an individual device may be determined by the instance parameters temp or
dtemp.

        M1 d g s b MOSN temp=35

will set the temperature of the specific MOS device to 35 °C.

        M2 d g s b MOSN dtemp=20

will set the temperature of device M2 at a delta of 20° above the overall temperature.
The temperatures thus set are static throughout the simulation. It is possible, however, to sweep
the temperature by a command like

        .dc temp 25 49 2

starting at 25 °C, stopping at 49 °C with a step of 2° (see 11.3.2).
The current overall temperature may be assessed by the variable TEMPER, which can be used as
part of an equation in B sources (5.1.2) or behavioral E, G, R, L, C sources (e.g. 5.2). A typical
example may look like

        Bt1 1 2 V=’5 + TEMPER*TEMPER’

The nominal temperature, a reference temperature where device model parameters have been
measured, is called tnom.

        .options tnom=25

will set the nominal temperature for all devices to 25 °C (11.1.1). Tnom sometimes may be set
as a model parameter in a .model line (3.2.2), depending on the specific class of devices and
its model parameter set.

## 1.4 Convergence

Ngspice uses the Newton-Raphson algorithm to solve nonlinear equations arising from circuit
description. The NR algorithm is interactive and terminates when both of the following conditions
hold:

   1. The nonlinear branch currents converge to within a tolerance of 0.1% or 1 picoamp (1.0e-
      12 Amp), whichever is larger.
   2. The node voltages converge to within a tolerance of 0.1% or 1 microvolt (1.0e-6 Volt),
      whichever is larger.

### 1.4.1 Voltage convergence criterion

The algorithm has reached convergence when the difference between the last iteration k and the
current one (k + 1)

                               (k+1)      (k)
                             vn        − vn     ≤ RELTOL vnmax + VNTOL,                      (1.7)

where
                                                                     
                                                       (k+1)    (k)
                                  vnmax = max         vn     , vn         .                  (1.8)

The RELTOL (RELative TOLerance) parameter, which default value is 10−3 , specifies how small
the solution update must be, relative to the node voltage, to consider the solution to have converged.
The VNTOL (absolute convergence) parameter, which has 1µV as default value, becomes
important when node voltages have near zero values. The relative parameter alone, in such case,
would need too strict tolerances, perhaps lower than computer round-off error, and thus convergence
would never be achieved. VNTOL forces the algorithm to consider as converged any node
whose solution update is lower than its value.

### 1.4.2 Current convergence criterion

Ngspice checks the convergence on the non-linear functions that describe the non-linear branches
in circuit elements. In semiconductor devices the functions defines currents through the device
and thus the name of the criterion.
Ngspice computes the difference between the value of the nonlinear function computed for the
last voltage and the linear approximation of the same current computed with the actual voltage

                           \(k+1)     (k)
                           ibranch − ibranch ≤ RELTOL ibrmax + ABSTOL,                         (1.9)

where
                                                              
                                               \
                                               (k+1) (k)
                                 ibrmax = max ibranch , ibranch .                          (1.10)

In the two expressions above, the i\
                                   branch indicates the linear approximation of the current.

### 1.4.3 Convergence failure

Although the algorithm used in ngspice has been found to be very reliable, in some cases it fails
to converge to a solution. When this failure occurs, the program terminates the job. Failure
to converge in dc analysis is usually due to an error in specifying circuit connections, element
values, or model parameter values. Regenerative switching circuits or circuits with positive
feedback probably will not converge in the dc analysis unless the OFF option is used for some of
the devices in the feedback path, .nodeset control line is used to force the circuit to converge
to the desired state.
