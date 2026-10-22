# Manual de ngspice-47 — índice

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Un archivo por capítulo; los capítulos largos, una carpeta con un archivo por sección N.M.
Para ubicar un título dentro de un archivo: `grep -n "^#" <archivo>`. Para buscar en todo: `grep -rn "<texto>" docs/ngspice/md`.

## 1 Introduction

- [01-introduction.md](01-introduction.md)
  - 1.1 Simulation Algorithms
    - 1.1.1 Analog Simulation
    - 1.1.2 Matrix solvers
    - 1.1.3 Device Models for Analog Simulation
    - 1.1.4 Digital Simulation
    - 1.1.5 Mixed-Signal Simulation
    - 1.1.6 Mixed-Level Simulation (Electronic and TCAD)
  - 1.2 Supported Analyses
    - 1.2.1 DC Analysis
    - 1.2.2 AC Small-Signal Analysis
    - 1.2.3 Transient Analysis
    - 1.2.4 Pole-Zero Analysis
    - 1.2.5 Small-Signal Distortion Analysis
    - 1.2.6 Sensitivity Analysis
    - 1.2.7 Noise Analysis
    - 1.2.8 Periodic Steady State Analysis
  - 1.3 Analysis at Different Temperatures
    - 1.3.1 Introduction
    - 1.3.2 Controlling the temperature
  - 1.4 Convergence
    - 1.4.1 Voltage convergence criterion
    - 1.4.2 Current convergence criterion
    - 1.4.3 Convergence failure

## 2 Circuit Description

- [02-circuit-description.md](02-circuit-description.md)
  - 2.1 General Structure and Conventions
    - 2.1.1 Input file structure
    - 2.1.2 Syntax check
    - 2.1.3 Some naming conventions
    - 2.1.4 Topological constraints
  - 2.2 Dot commands
  - 2.3 Circuit elements (device instances)
  - 2.4 Basic lines
    - 2.4.1 .TITLE line
    - 2.4.2 .END Line
    - 2.4.3 Comments
    - 2.4.4 End-of-line comments
    - 2.4.5 Continuation lines
  - 2.5 .MODEL Device Models
  - 2.6 .SUBCKT Subcircuits
    - 2.6.1 .SUBCKT Line
    - 2.6.2 .ENDS Line
    - 2.6.3 Subcircuit Calls
  - 2.7 .GLOBAL
  - 2.8 .INCLUDE
  - 2.9 .INCPSLT
  - 2.10 .LIB
  - 2.11 .PARAM Parametric netlists
    - 2.11.1 .param line
    - 2.11.2 Brace expressions in circuit elements:
    - 2.11.3 Subcircuit parameters
    - 2.11.4 Symbol scope
    - 2.11.5 Syntax of expressions
    - 2.11.6 Reserved words
    - 2.11.7 A word of caution on the three ngspice expression parsers
  - 2.12 .FUNC
  - 2.13 .CSPARAM
  - 2.14 .TEMP
  - 2.15 .IF Condition-Controlled Netlist
  - 2.16 Parameters, functions, expressions, and command scripts
    - 2.16.1 Parameters
    - 2.16.2 Nonlinear sources
    - 2.16.3 Control commands, Command scripts

## 3 Circuit Elements and Models

- [03-circuit-elements-and-models.md](03-circuit-elements-and-models.md)
  - 3.1 About netlists, device instances, models and model pa-
  - 3.2 General options
    - 3.2.1 Paralleling devices with multiplier m
    - 3.2.2 Instance and model parameters
    - 3.2.3 Model binning
    - 3.2.4 Initial conditions
  - 3.3 Elementary Devices
    - 3.3.1 Resistors
    - 3.3.2 Semiconductor Resistors
    - 3.3.3 Semiconductor Resistor Model (R)
    - 3.3.4 Resistors, dependent on expressions (behavioral resistor)
    - 3.3.5 Resistor with nonlinear r2_cmc or r3_cmc models
    - 3.3.6 Capacitors
    - 3.3.7 Semiconductor Capacitors
    - 3.3.8 Semiconductor Capacitor Model (C)
    - 3.3.9 Capacitors, dependent on expressions (behavioral capacitor)
    - 3.3.10 Inductors
    - 3.3.11 Inductor model
    - 3.3.12 Coupled (Mutual) Inductors
    - 3.3.13 Inductors, dependent on expressions (behavioral inductor)
    - 3.3.14 Capacitor or inductor with initial conditions
    - 3.3.15 Switches
    - 3.3.16 Switch Model (SW/CSW)

## 4 Voltage and Current Sources

- [04-voltage-and-current-sources.md](04-voltage-and-current-sources.md)
  - 4.1 Independent Sources for Voltage or Current
    - 4.1.1 Pulse
    - 4.1.2 Sinusoidal
    - 4.1.3 Exponential
    - 4.1.4 Piece-Wise Linear
    - 4.1.5 Single-Frequency FM
    - 4.1.6 Amplitude modulated source (AM)
    - 4.1.7 Transient noise source
    - 4.1.8 Random voltage source
    - 4.1.9 External voltage or current input
    - 4.1.10 Arbitrary Phase Sources
    - 4.1.11 RF Port
  - 4.2 Linear Dependent Sources
    - 4.2.1 Gxxxx: Linear Voltage-Controlled Current Sources (VCCS)
    - 4.2.2 Exxxx: Linear Voltage-Controlled Voltage Sources (VCVS)
    - 4.2.3 Fxxxx: Linear Current-Controlled Current Sources (CCCS)
    - 4.2.4 Hxxxx: Linear Current-Controlled Voltage Sources (CCVS)
    - 4.2.5 Polynomial Source Compatibility

## 5 Non-linear Dependent Sources (Behavioral

- [05-non-linear-dependent-sources-behavioral.md](05-non-linear-dependent-sources-behavioral.md)
  - 5.1 Bxxxx: Nonlinear dependent source (ASRC)
    - 5.1.1 Syntax and usage
    - 5.1.2 Special B-Source Variables time, temper, hertz
    - 5.1.3 par(’expression’)
    - 5.1.4 Piecewise Linear Function: pwl
  - 5.2 Exxxx: non-linear voltage source
    - 5.2.1 VOL
    - 5.2.2 VALUE
    - 5.2.3 TABLE
    - 5.2.4 POLY
    - 5.2.5 LAPLACE
    - 5.2.6 FREQ
    - 5.2.7 AND/OR/NAND/NOR
  - 5.3 Gxxxx: non-linear current source
    - 5.3.1 CUR
    - 5.3.2 VALUE
    - 5.3.3 TABLE
    - 5.3.4 POLY
    - 5.3.5 LAPLACE
    - 5.3.6 FREQ
    - 5.3.7 Example
  - 5.4 Debugging a behavioral source
  - 5.5 POLY Sources
    - 5.5.1 E voltage source, G current source
    - 5.5.2 F voltage source, H current source

## 6 Transmission Lines

- [06-transmission-lines.md](06-transmission-lines.md)
  - 6.1 Lossless Transmission Lines
  - 6.2 Lossy Transmission Lines
    - 6.2.1 Lossy Transmission Line Model (LTRA)
  - 6.3 Uniform Distributed RC Lines
    - 6.3.1 Uniform Distributed RC Model (URC)
  - 6.4 KSPICE Lossy Transmission Lines
    - 6.4.1 Single Lossy Transmission Line (TXL)
    - 6.4.2 Coupled Multiconductor Line (CPL)

## 7 Device Models

- [7.1 Instance lines and .model lines](07-device-models/07.01-instance-lines-and-model-lines.md)
- [7.2 Junction Diodes](07-device-models/07.02-junction-diodes.md)
  - 7.2.1 Diode Model (D)
  - 7.2.2 Diode Equations
  - 7.2.3 Diode models available via OpenVAF/OSDI
- [7.3 BJT](07-device-models/07.03-bjt.md)
  - 7.3.1 Bipolar Junction Transistors (BJTs)
  - 7.3.2 BJT Models (NPN/PNP)
  - 7.3.3 Gummel-Poon Models
  - 7.3.4 VBIC Model
  - 7.3.5 HICUM level 2 Model
  - 7.3.6 BJT models available via OpenVAF/OSDI
- [7.4 JFETs](07-device-models/07.04-jfets.md)
  - 7.4.1 Junction Field-Effect Transistors (JFETs)
  - 7.4.2 JFET Models (NJF/PJF)
  - 7.4.3 Basic model statement
  - 7.4.4 JFET level 1 model with Parker Skellern modification
  - 7.4.5 JFET level 2 Parker Skellern model
- [7.5 MESFETs](07-device-models/07.05-mesfets.md)
  - 7.5.1 MESFET devices
  - 7.5.2 MESFET Models (NMF/PMF)
  - 7.5.3 Model by Statz e.a.
  - 7.5.4 Model by Ytterdal e.a.
  - 7.5.5 hfet1 and hfet2
- [7.6 MOSFETs](07-device-models/07.06-mosfets.md)
  - 7.6.1 MOSFET devices
  - 7.6.2 MOSFET models (NMOS/PMOS)
  - 7.6.3 BSIM Models
  - 7.6.4 BSIMSOI models (levels 10, 58, 55, 56, 57)
  - 7.6.5 SOI3 model (level 60)
  - 7.6.6 HiSIM models of the University of Hiroshima
  - 7.6.7 MOS models available via OpenVAF/OSDI
- [7.7 Power MOSFET model (VDMOS)](07-device-models/07.07-power-mosfet-model-vdmos.md)

## 8 Mixed-Mode and Behavioral Modeling

- [8.1 Code Model Element & .MODEL Cards](08-mixed-mode-and-behavioral-modeling/08.01-code-model-element-model-cards.md)
  - 8.1.1 Syntax
  - 8.1.2 Examples
  - 8.1.3 Search path for file input
  - 8.1.4 Code model location and assessment
- [8.2 Analog Models](08-mixed-mode-and-behavioral-modeling/08.02-analog-models.md)
  - 8.2.1 Gain
  - 8.2.2 Summer
  - 8.2.3 Multiplier
  - 8.2.4 Divider
  - 8.2.5 Limiter
  - 8.2.6 Controlled Limiter
  - 8.2.7 PWL Controlled Source
  - 8.2.8 PWL Time Controlled Source with optional edge smoothing
  - 8.2.9 Filesource (PWL sourced from file)
  - 8.2.10 Multi_input_PWL_block
  - 8.2.11 Analog Switch
  - 8.2.12 Alternative Analog Switch
  - 8.2.13 Zener Diode
  - 8.2.14 Current Limiter
  - 8.2.15 Hysteresis Block
  - 8.2.16 Differentiator
  - 8.2.17 Integrator
  - 8.2.18 S-Domain Transfer Function
  - 8.2.19 PWL Transfer Function
  - 8.2.20 Slew Rate Block
  - 8.2.21 Inductive Coupling
  - 8.2.22 Magnetic Core
  - 8.2.23 Controlled Sine Wave Oscillator
  - 8.2.24 Controlled Triangle Wave Oscillator
  - 8.2.25 Controlled Square Wave Oscillator
  - 8.2.26 Controlled One-Shot
  - 8.2.27 Capacitance Meter
  - 8.2.28 Inductance Meter
  - 8.2.29 Memristor
  - 8.2.30 2D table model
  - 8.2.31 3D table model
  - 8.2.32 Simple Diode Model
  - 8.2.33 Analog delay
  - 8.2.34 Potentiometer
  - 8.2.35 Delayed state of a node
  - 8.2.36 OTA with small signal noise enabled
- [8.3 Hybrid Models](08-mixed-mode-and-behavioral-modeling/08.03-hybrid-models.md)
  - 8.3.1 Digital-to-Analog Node Bridge
  - 8.3.2 Analog-to-Digital Node Bridge
  - 8.3.3 Bidirectional Analog/Digital Node Bridge
  - 8.3.4 Controlled Digital Oscillator
  - 8.3.5 Node bridge from digital to real with enable
  - 8.3.6 A Z**-1 block working on real data
  - 8.3.7 A gain block for event-driven real data
  - 8.3.8 Node bridge from real to analog voltage
  - 8.3.9 Controlled PWM Oscillator
- [8.4 Digital Models](08-mixed-mode-and-behavioral-modeling/08.04-digital-models.md)
  - 8.4.1 Buffer
  - 8.4.2 Inverter
  - 8.4.3 And
  - 8.4.4 Nand
  - 8.4.5 Or
  - 8.4.6 Nor
  - 8.4.7 Xor
  - 8.4.8 Xnor
  - 8.4.9 Tristate
  - 8.4.10 Pullup
  - 8.4.11 Pulldown
  - 8.4.12 D Flip Flop
  - 8.4.13 JK Flip Flop
  - 8.4.14 Toggle Flip Flop
  - 8.4.15 Set-Reset Flip Flop
  - 8.4.16 D Latch
  - 8.4.17 Set-Reset Latch
  - 8.4.18 State Machine
  - 8.4.19 Frequency Divider
  - 8.4.20 RAM
  - 8.4.21 Digital Source
  - 8.4.22 LUT
  - 8.4.23 General LUT
  - 8.4.24 D_process
  - 8.4.25 d_cosim
- [8.5 Transmission lines models](08-mixed-mode-and-behavioral-modeling/08.05-transmission-lines-models.md)
  - 8.5.1 Generic transmission line
  - 8.5.2 Generic coupled lines
  - 8.5.3 Microstip line
  - 8.5.4 Coupled microstrip
  - 8.5.5 Microstrip open end
- [8.6 Predefined Node Types for event driven simulation](08-mixed-mode-and-behavioral-modeling/08.06-predefined-node-types-for-event-driven-simulatio.md)
  - 8.6.1 Digital Node Type
  - 8.6.2 Real Node Type
  - 8.6.3 Int Node Type
  - 8.6.4 (Digital) Input/Output
- [8.7 Automatic insertion of bridging devices](08-mixed-mode-and-behavioral-modeling/08.07-automatic-insertion-of-bridging-devices.md)

## 9 Verilog-A Compact Device Models

- [09-verilog-a-compact-device-models.md](09-verilog-a-compact-device-models.md)
  - 9.1 Introduction
  - 9.2 OSDI/OpenVAF
  - 9.3 How to create and apply OpenVAF models
    - 9.3.1 Preparing for simulation
    - 9.3.2 OSDI/OpenVAF examples distributed with ngspice

## 10 Digital Device Models

- [10-digital-device-models.md](10-digital-device-models.md)
  - 10.1 U devices (basic digital building blocks)
    - 10.1.1 General format
    - 10.1.2 List of devices available in ngspice (basic types)
    - 10.1.3 URC transmission line versus U devices
  - 10.2 Support for standard digital devices
  - 10.3 Digital devices defined by a Hardware Description Lan-
    - 10.3.1 Using Verilator, Verilog, and code model d_cosim
    - 10.3.2 Using Icarus Verilog, and code model d_cosim
    - 10.3.3 Using GHDL and code model d_cosim.
    - 10.3.4 Using independent processes (e.g. C coded), pipes, and code model
    - 10.3.5 Using Yosys to map digital Verilog onto basic code model cells

## 11 Analyses and Output Control (batch

- [11.1 Simulator Variables (.options)](11-analyses-and-output-control-batch/11.01-simulator-variables-options.md)
  - 11.1.1 General Options
  - 11.1.2 OP and DC Solution Options
  - 11.1.3 AC Solution Options
  - 11.1.4 Transient Analysis Options
  - 11.1.5 ELEMENT Specific options
  - 11.1.6 Transmission Lines Specific Options
  - 11.1.7 Precedence of option and .options commands
- [11.2 Initial Conditions](11-analyses-and-output-control-batch/11.02-initial-conditions.md)
  - 11.2.1 .NODESET: Specify Initial Node Voltage Guesses
  - 11.2.2 .IC: Set Initial Conditions
- [11.3 Analyses](11-analyses-and-output-control-batch/11.03-analyses.md)
  - 11.3.1 .AC: Small-Signal AC Analysis
  - 11.3.2 .DC: DC Transfer Function
  - 11.3.3 .DISTO: Distortion Analysis
  - 11.3.4 .NOISE: Noise Analysis
  - 11.3.5 .OP: Operating Point Analysis
  - 11.3.6 .PZ: Pole-Zero Analysis
  - 11.3.7 .SENS: DC or Small-Signal AC Sensitivity Analysis
  - 11.3.8 .SP S-Parameter Analysis
  - 11.3.9 .TF: Transfer Function Analysis
  - 11.3.10 .TRAN: Transient Analysis
  - 11.3.11 Transient noise analysis (at low frequency)
  - 11.3.12 .PSS: Periodic Steady State Analysis
- [11.4 Measurements after AC, DC and Transient Analysis](11-analyses-and-output-control-batch/11.04-measurements-after-ac-dc-and-transient-analysis.md)
  - 11.4.1 .meas(ure)
  - 11.4.2 batch versus interactive mode
  - 11.4.3 General remarks
  - 11.4.4 Input
  - 11.4.5 Trig Targ
  - 11.4.6 Find ... When
  - 11.4.7 AVG|MIN|MAX|PP|RMS|MIN_AT|MAX_AT
  - 11.4.8 Integ
  - 11.4.9 param
  - 11.4.10 par(’expression’ )
  - 11.4.11 Deriv
  - 11.4.12 More examples
- [11.5 Safe Operating Area (SOA) warning messages](11-analyses-and-output-control-batch/11.05-safe-operating-area-soa-warning-messages.md)
  - 11.5.1 Resistor and Capacitor SOA model parameters
  - 11.5.2 Diode SOA model parameters
  - 11.5.3 BJT SOA model parameters
  - 11.5.4 MOS SOA model parameters
  - 11.5.5 VDMOS SOA model parameters
- [11.6 Batch Output](11-analyses-and-output-control-batch/11.06-batch-output.md)
  - 11.6.1 .SAVE: Name vector(s) to be saved in raw file
  - 11.6.2 .PRINT Lines
  - 11.6.3 .PLOT Lines
  - 11.6.4 .FOUR: Fourier Analysis of Transient Analysis Output
  - 11.6.5 .PROBE: Save device node currents, device power dissipation, or
  - 11.6.6 par(’expression’): Algebraic expressions for output
  - 11.6.7 .width
  - 11.6.8 .SNDPARAM .SNDPRINT Write sound files *.wav from analogue
- [11.7 Measuring current through device terminals](11-analyses-and-output-control-batch/11.07-measuring-current-through-device-terminals.md)
  - 11.7.1 Using the .probe command
  - 11.7.2 Adding a voltage source in series
  - 11.7.3 Using option ’savecurrents’

## 12 Starting ngspice

- [12-starting-ngspice.md](12-starting-ngspice.md)
  - 12.1 Introduction
  - 12.2 Where to obtain ngspice
  - 12.3 Command line options for starting ngspice
  - 12.4 Starting options
    - 12.4.1 Batch mode
    - 12.4.2 Interactive mode
    - 12.4.3 Control mode (Interactive mode with control file or control sec-
  - 12.5 Standard configuration file spinit
  - 12.6 User defined configuration file .spiceinit
  - 12.7 Environmental variables
    - 12.7.1 Ngspice specific variables
    - 12.7.2 Common environment variables
  - 12.8 Memory usage
  - 12.9 Simulation time
  - 12.10 Ngspice on multi-core processors using OpenMP
    - 12.10.1 Introduction
    - 12.10.2 Internals
    - 12.10.3 Some results
    - 12.10.4 Usage
    - 12.10.5 Literature
  - 12.11 Compatibility
    - 12.11.1 Compatibility mode
    - 12.11.2 Missing functions
    - 12.11.3 Devices
    - 12.11.4 Controls and commands
    - 12.11.5 PSPICE Compatibility mode
    - 12.11.6 LTSPICE Compatibility mode
    - 12.11.7 LTSPICE/PSPICE Compatibility mode
    - 12.11.8 KiCad Compatibility mode
    - 12.11.9 Spectre Compatibility mode
    - 12.11.10 HSPICE Compatibility mode
  - 12.12 Transient simulation time steps with voltage-based trun-
  - 12.13 Server mode option -s
  - 12.14 Pipe mode option -p
  - 12.15 Ngspice control via input, output fifos
  - 12.16 Tests
  - 12.17 Tools for debugging a circuit netlist
    - 12.17.1 options and initial conditions
    - 12.17.2 set debug
    - 12.17.3 set ngdebug
    - 12.17.4 miscellaneous
  - 12.18 Reporting bugs and errors

## 13 Interactive Interpreter

- [13.1 Introduction](13-interactive-interpreter/13.01-introduction.md)
- [13.2 Expressions, Functions, and Constants](13-interactive-interpreter/13.02-expressions-functions-and-constants.md)
- [13.3 Plots](13-interactive-interpreter/13.03-plots.md)
- [13.4 Command Interpretation](13-interactive-interpreter/13.04-command-interpretation.md)
  - 13.4.1 On the console
  - 13.4.2 Scripts
  - 13.4.3 Add-on to circuit file
- [13.5 Commands](13-interactive-interpreter/13.05-commands.md)
  - 13.5.1 Ac: Perform an AC, small-signal frequency response analysis
  - 13.5.2 Alias: Create an alias for a command
  - 13.5.3 Alter: Change a device or model parameter
  - 13.5.4 Altermod: Change model parameter(s)
  - 13.5.5 Alterparam: Change value of a global parameter
  - 13.5.6 Asciiplot: Plot values using old-style character plots
  - 13.5.7 Aspice*: Asynchronous ngspice run
  - 13.5.8 Bg_ctrl**: suspend running controls until bg_run has finished
  - 13.5.9 Bg_halt**: halt a run
  - 13.5.10 Bg_run**: Run analysis from the input file in the background
  - 13.5.11 Bug: Output URL for ngspice bug tracker
  - 13.5.12 Cd: Change directory
  - 13.5.13 Cdump: Dump the control flow to the screen
  - 13.5.14 Circbyline: Enter a circuit line by line
  - 13.5.15 Codemodel: Load an XSPICE code model library
  - 13.5.16 Compose: Compose a vector
  - 13.5.17 Cutout: Cut out a section of all vectors in a tran plot
  - 13.5.18 Dc: Perform a DC-sweep analysis
  - 13.5.19 Define: Define a function
  - 13.5.20 Deftype: Define a new type for a vector or plot
  - 13.5.21 Delete: Remove a trace or breakpoint
  - 13.5.22 Destroy: Delete an output data set
  - 13.5.23 Devhelp: information on available devices
  - 13.5.24 Diff: Compare vectors
  - 13.5.25 Display: List known vectors and types
  - 13.5.26 Echo: Print text
  - 13.5.27 Edit*: Edit the current circuit
  - 13.5.28 Edisplay: Print a list of all the event nodes
  - 13.5.29 Eprint: Print an event driven node
  - 13.5.30 Eprvcd: Dump nodes in VCD format
  - 13.5.31 Esave: Save a set of event node outputs
  - 13.5.32 Fclose: close an open file handle
  - 13.5.33 FFT: fast Fourier transform of vectors
  - 13.5.34 Fopen: open a text file
  - 13.5.35 Fourier: Perform a Fourier transform
  - 13.5.36 Fread: read into a variable from a text file
  - 13.5.37 Getcwd: Print the current working directory
  - 13.5.38 Gnuplot: Graphics output via gnuplot
  - 13.5.39 Hardcopy: Save a plot to a file for printing
  - 13.5.40 Help: Print summaries of Ngspice commands
  - 13.5.41 History: Review previous commands
  - 13.5.42 Inventory: Print circuit inventory
  - 13.5.43 Iplot*: Incremental plot
  - 13.5.44 Let: Assign a value to a vector
  - 13.5.45 Linearize: Interpolate to a linear scale
  - 13.5.46 Listing: Print a listing of the current circuit
  - 13.5.47 Load: Load rawfile data
  - 13.5.48 Mc_source: Reload the circuit netlist from an internal storage
  - 13.5.49 Meas: Measurements on simulation data
  - 13.5.50 Mdump: Dump the matrix values to a file (or to console)
  - 13.5.51 Mrdump: Dump the matrix right hand side values to a file (or to console)
  - 13.5.52 Noise: Noise analysis
  - 13.5.53 Op: Perform an operating point analysis
  - 13.5.54 Option: Set a ngspice option
  - 13.5.55 Plot*: Plot vectors on the display
  - 13.5.56 Pre_<command>: execute commands prior to parsing the circuit
  - 13.5.57 Pre_OSDI: load a *.osdi compact device model shared library
  - 13.5.58 Print: Print values
  - 13.5.59 Psd: power spectral density of vectors
  - 13.5.60 Pyplot: plotting with Python’s matplotlib
  - 13.5.61 Quit: Leave Ngspice
  - 13.5.62 Rehash: Reset internal hash tables
  - 13.5.63 Remcirc: Remove the current circuit
  - 13.5.64 Remzerovec: Remove zero length vectors
  - 13.5.65 Reset: Reset an analysis
  - 13.5.66 Reshape: Alter the dimensionality or dimensions of a vector
  - 13.5.67 Resume: Continue a simulation after a stop
  - 13.5.68 Run: Run analysis from the input file
  - 13.5.69 Rusage: Resource usage
  - 13.5.70 Save: Save a set of outputs
  - 13.5.71 Sens: Run a sensitivity analysis
  - 13.5.72 Set: Set the value of a variable
  - 13.5.73 Setcs: Set the value of a variable, case preserved
  - 13.5.74 Setcirc: Change the current circuit
  - 13.5.75 Setplot: Switch the current set of vectors
  - 13.5.76 Setscale: Set the scale vector for the current plot
  - 13.5.77 Setseed: Set the seed value for the random number generator
  - 13.5.78 Settype: Set the type of a vector
  - 13.5.79 Shell: Call the command interpreter
  - 13.5.80 Shift: Alter a list variable
  - 13.5.81 Show: List device state
  - 13.5.82 Showmod: List model parameter values
  - 13.5.83 Sndparam: Prepare sound file *.wav output
  - 13.5.84 Sndprint: Save a *.wav sound file
  - 13.5.85 Snload: Load the snapshot file
  - 13.5.86 Snsave: Save a snapshot file
  - 13.5.87 Source: Read a ngspice input file
  - 13.5.88 Sp: S-Parameter Analysis
  - 13.5.89 Spec: Create a frequency domain plot
  - 13.5.90 Status: Display breakpoint information
  - 13.5.91 Step: Run a fixed number of time-points
  - 13.5.92 Stop: Set a breakpoint
  - 13.5.93 Strcmp: Compare two strings
  - 13.5.94 Strslice: Extract a substring
  - 13.5.95 Strstr: Find a substring
  - 13.5.96 Sysinfo: Print system information
  - 13.5.97 Tf: Run a Transfer Function analysis
  - 13.5.98 Trace: Trace nodes
  - 13.5.99 Tran: Perform a transient analysis
  - 13.5.100 Transpose: Swap the elements in a multi-dimensional data set
  - 13.5.101 Unalias: Retract an alias
  - 13.5.102 Undefine: Retract a definition
  - 13.5.103 Unlet: Delete the specified vector(s)
  - 13.5.104 Unset: Clear a variable
  - 13.5.105 Version: Print the version of ngspice
  - 13.5.106 Where: Identify troublesome node or device
  - 13.5.107 Wrdata: Write data to a file (simple table)
  - 13.5.108 Write: Write data to a file (Spice3f5 format)
  - 13.5.109 Wrnodev: Write node voltage values to a file (.ic=xx format)
  - 13.5.110 Wrs2p: Write scattering parameters to file (Touchstone® for-
- [13.6 Control Structures](13-interactive-interpreter/13.06-control-structures.md)
  - 13.6.1 While - End
  - 13.6.2 Repeat - End
  - 13.6.3 Dowhile - End
  - 13.6.4 Foreach - End
  - 13.6.5 If - Then - Else
  - 13.6.6 Label
  - 13.6.7 Goto
  - 13.6.8 Continue
  - 13.6.9 Break
- [13.7 Internally predefined variables](13-interactive-interpreter/13.07-internally-predefined-variables.md)
- [13.8 Scripts](13-interactive-interpreter/13.08-scripts.md)
  - 13.8.1 Variables
  - 13.8.2 Vectors
  - 13.8.3 Assessing vectors in subcircuits
  - 13.8.4 Commands
  - 13.8.5 control structures
  - 13.8.6 Example script ’spectrum’
  - 13.8.7 Example script for random numbers
  - 13.8.8 Parameter sweep
  - 13.8.9 Output redirection
- [13.9 Scattering parameters (S-parameters)](13-interactive-interpreter/13.09-scattering-parameters-s-parameters.md)
  - 13.9.1 Intro
  - 13.9.2 S-parameter measurement basics
  - 13.9.3 Usage of .sp and sp
  - 13.9.4 Usage of the script
- [13.10 Using shell variables](13-interactive-interpreter/13.10-using-shell-variables.md)
- [13.11 Sound files (*.wav)](13-interactive-interpreter/13.11-sound-files-wav.md)
- [13.12 MISCELLANEOUS](13-interactive-interpreter/13.12-miscellaneous.md)
- [13.13 Bugs](13-interactive-interpreter/13.13-bugs.md)

## 14 Ngspice User Interfaces

- [14-ngspice-user-interfaces.md](14-ngspice-user-interfaces.md)
  - 14.1 MS Windows Graphical User Interface
  - 14.2 MS Windows Console
  - 14.3 Linux
  - 14.4 MSYS, CygWin and MacOS
  - 14.5 Error handling
  - 14.6 Output-to-file options
    - 14.6.1 Graphics files
    - 14.6.2 Tabulated files
  - 14.7 Gnuplot
    - 14.7.1 Using Gnuplot to produce 1D graphs of (electrical) simulation re-
    - 14.7.2 Using gnuplot to produce 2D contour plots for Cider
  - 14.8 pyplot
  - 14.9 Integration with CAD software and ‘third party’ GUIs
    - 14.9.1 KiCad
    - 14.9.2 Xschem
    - 14.9.3 Qucs-S
    - 14.9.4 GNU Spice GUI
    - 14.9.5 XCircuit
    - 14.9.6 NyanCAD Mosaic
    - 14.9.7 MSEspice
    - 14.9.8 GNU Octave

## 15 ngspice as shared library or dynamic link

- [15-ngspice-as-shared-library-or-dynamic-link.md](15-ngspice-as-shared-library-or-dynamic-link.md)
  - 15.1 Compile options
    - 15.1.1 How to get the sources
    - 15.1.2 Linux, MINGW, CYGWIN
    - 15.1.3 MS Visual Studio
  - 15.2 Linking shared ngspice to a calling application
    - 15.2.1 Linking during creating the caller
    - 15.2.2 Loading at runtime
  - 15.3 Shared ngspice API
    - 15.3.1 structs and types defined for transporting data
    - 15.3.2 Exported functions
    - 15.3.3 Callback functions
  - 15.4 General remarks on using the API
    - 15.4.1 Loading a netlist
    - 15.4.2 Running the simulation
    - 15.4.3 Accessing data
    - 15.4.4 Altering model or device parameters
    - 15.4.5 Output
    - 15.4.6 Error handling
  - 15.5 Example applications
  - 15.6 ngspice parallel
    - 15.6.1 Go parallel!
    - 15.6.2 Additional exported functions
    - 15.6.3 Additional callback functions
    - 15.6.4 Parallel ngspice example

## 16 TCLspice

- [16-tclspice.md](16-tclspice.md)
  - 16.1 tclspice framework
  - 16.2 tclspice documentation
  - 16.3 spicetoblt
  - 16.4 Running TCLspice
  - 16.5 examples
    - 16.5.1 Active capacitor measurement
    - 16.5.2 Optimization of a linearization circuit for a Thermistor
    - 16.5.3 Progressive display
  - 16.6 Compiling
    - 16.6.1 Linux
    - 16.6.2 MS Windows
  - 16.7 MS Windows 32 Bit binaries

## 17 Example Circuits

- [17-example-circuits.md](17-example-circuits.md)
  - 17.1 AC coupled transistor amplifier
  - 17.2 Differential Pair
  - 17.3 MOSFET Characterization
  - 17.4 RTL Inverter
  - 17.5 Four-Bit Binary Adder (Bipolar)
  - 17.6 Four-Bit Binary Adder (MOS)
  - 17.7 Transmission-Line Inverter

## 18 Statistical circuit analysis

- [18-statistical-circuit-analysis.md](18-statistical-circuit-analysis.md)
  - 18.1 Introduction
  - 18.2 Using random param(eters)
  - 18.3 Behavioral sources (B, E, G, R, L, C) with random con-
  - 18.4 ngspice control language
  - 18.5 Monte-Carlo Simulation
    - 18.5.1 Varying model or instance parameters
    - 18.5.2 Using the ngspice control language
  - 18.6 Data evaluation with Gnuplot

## 19 Circuit optimization with ngspice

- [19-circuit-optimization-with-ngspice.md](19-circuit-optimization-with-ngspice.md)
  - 19.1 Optimization of a circuit
  - 19.2 ngspice optimizer using ngspice scripts
  - 19.3 ngspice optimizer using tclspice
  - 19.4 ngspice optimizer using a Python script
  - 19.5 ngspice optimizer using ASCO
    - 19.5.1 Three stage operational amplifier
    - 19.5.2 Digital inverter
    - 19.5.3 Bandpass
    - 19.5.4 Class-E power amplifier

## 20 Notes

- [20-notes.md](20-notes.md)
  - 20.1 Glossary
  - 20.2 Acronyms and Abbreviations
  - 20.3 To Do

## 21 XSPICE Basics

- [21-xspice-basics.md](21-xspice-basics.md)
  - 21.1 ngspice with the XSPICE option
  - 21.2 The XSPICE Code Model Subsystem
  - 21.3 XSPICE Top-Level Diagram

## 22 Execution Procedures

- [22-execution-procedures.md](22-execution-procedures.md)
  - 22.1 Simulation and Modeling Overview
    - 22.1.1 Describing the Circuit
  - 22.2 Circuit Description Syntax
    - 22.2.1 XSPICE Syntax Extensions
  - 22.3 How to create code models

## 23 Example circuits

- [23-example-circuits.md](23-example-circuits.md)
  - 23.1 Amplifier with XSPICE model ‘gain’
  - 23.2 XSPICE advanced usage
    - 23.2.1 Circuit example C3
    - 23.2.2 Running example C3

## 24 Code Models and User-Defined Nodes

- [24.1 Code Model Data Type Definitions](24-code-models-and-user-defined-nodes/24.01-code-model-data-type-definitions.md)
- [24.2 Creating Code Models](24-code-models-and-user-defined-nodes/24.02-creating-code-models.md)
- [24.3 Creating User-Defined Nodes](24-code-models-and-user-defined-nodes/24.03-creating-user-defined-nodes.md)
- [24.4 Adding a new code model library](24-code-models-and-user-defined-nodes/24.04-adding-a-new-code-model-library.md)
- [24.5 Compiling and loading the new code model (library)](24-code-models-and-user-defined-nodes/24.05-compiling-and-loading-the-new-code-model-library.md)
- [24.6 Interface Specification File](24-code-models-and-user-defined-nodes/24.06-interface-specification-file.md)
  - 24.6.1 The Name Table
  - 24.6.2 The Port Table
  - 24.6.3 The Parameter Table
  - 24.6.4 Static Variable Table
- [24.7 Model Definition File](24-code-models-and-user-defined-nodes/24.07-model-definition-file.md)
  - 24.7.1 Macros
  - 24.7.2 Function Library
- [24.8 Small signal noise in analogue code models](24-code-models-and-user-defined-nodes/24.08-small-signal-noise-in-analogue-code-models.md)
- [24.9 User-Defined Node Definition File](24-code-models-and-user-defined-nodes/24.09-user-defined-node-definition-file.md)
  - 24.9.1 Macros
  - 24.9.2 Function Library
  - 24.9.3 Example UDN Definition File

## 25 Error Messages

- [25-error-messages.md](25-error-messages.md)
  - 25.1 Preprocessor Error Messages
  - 25.2 Simulator Error Messages
  - 25.3 Code Model Error Messages
    - 25.3.1 Code Model aswitch
    - 25.3.2 Code Model climit
    - 25.3.3 Code Model core
    - 25.3.4 Code Model d_osc
    - 25.3.5 Code Model d_source
    - 25.3.6 Code Model d_state
    - 25.3.7 Code Model oneshot
    - 25.3.8 Code Model pwl
    - 25.3.9 Code Model s_xfer
    - 25.3.10 Code Model sine
    - 25.3.11 Code Model square
    - 25.3.12 Code Model triangle

## 26 CIDER User’s Manual

- [26.1 SPECIFICATION](26-cider-users-manual/26.01-specification.md)
  - 26.1.1 Examples
- [26.2 BOUNDARY, INTERFACE](26-cider-users-manual/26.02-boundary-interface.md)
  - 26.2.1 DESCRIPTION
  - 26.2.2 PARAMETERS
  - 26.2.3 EXAMPLES
- [26.3 COMMENT](26-cider-users-manual/26.03-comment.md)
  - 26.3.1 DESCRIPTION
  - 26.3.2 EXAMPLES
- [26.4 CONTACT](26-cider-users-manual/26.04-contact.md)
  - 26.4.1 DESCRIPTION
  - 26.4.2 PARAMETERS
  - 26.4.3 EXAMPLES
  - 26.4.4 SEE ALSO
- [26.5 DOMAIN, REGION](26-cider-users-manual/26.05-domain-region.md)
  - 26.5.1 DESCRIPTION
  - 26.5.2 PARAMETERS
  - 26.5.3 EXAMPLES
  - 26.5.4 SEE ALSO
- [26.6 DOPING](26-cider-users-manual/26.06-doping.md)
  - 26.6.1 DESCRIPTION
  - 26.6.2 PARAMETERS
  - 26.6.3 EXAMPLES
  - 26.6.4 SEE ALSO
- [26.7 ELECTRODE](26-cider-users-manual/26.07-electrode.md)
  - 26.7.1 DESCRIPTION
  - 26.7.2 PARAMETERS
  - 26.7.3 EXAMPLES
  - 26.7.4 SEE ALSO
- [26.8 END](26-cider-users-manual/26.08-end.md)
  - 26.8.1 DESCRIPTION
- [26.9 MATERIAL](26-cider-users-manual/26.09-material.md)
  - 26.9.1 DESCRIPTION
  - 26.9.2 PARAMETERS
  - 26.9.3 EXAMPLES
  - 26.9.4 SEE ALSO
- [26.10 METHOD](26-cider-users-manual/26.10-method.md)
  - 26.10.1 DESCRIPTION
  - 26.10.2 Parameters
  - 26.10.3 Examples
- [26.11 Mobility](26-cider-users-manual/26.11-mobility.md)
  - 26.11.1 Description
  - 26.11.2 Parameters
  - 26.11.3 Examples
  - 26.11.4 SEE ALSO
  - 26.11.5 BUGS
- [26.12 MODELS](26-cider-users-manual/26.12-models.md)
  - 26.12.1 DESCRIPTION
  - 26.12.2 Parameters
  - 26.12.3 Examples
  - 26.12.4 See also
  - 26.12.5 Bugs
- [26.13 OPTIONS](26-cider-users-manual/26.13-options.md)
  - 26.13.1 DESCRIPTION
  - 26.13.2 Parameters
  - 26.13.3 Examples
  - 26.13.4 See also
- [26.14 OUTPUT](26-cider-users-manual/26.14-output.md)
  - 26.14.1 DESCRIPTION
  - 26.14.2 Parameters
  - 26.14.3 Examples
  - 26.14.4 SEE ALSO
- [26.15 TITLE](26-cider-users-manual/26.15-title.md)
  - 26.15.1 DESCRIPTION
  - 26.15.2 EXAMPLES
  - 26.15.3 BUGS
- [26.16 X.MESH, Y.MESH](26-cider-users-manual/26.16-xmesh-ymesh.md)
  - 26.16.1 DESCRIPTION
  - 26.16.2 Parameters
  - 26.16.3 EXAMPLES
  - 26.16.4 SEE ALSO
- [26.17 NUMD](26-cider-users-manual/26.17-numd.md)
  - 26.17.1 DESCRIPTION
  - 26.17.2 Parameters
  - 26.17.3 EXAMPLES
  - 26.17.4 SEE ALSO
  - 26.17.5 BUGS
- [26.18 NBJT](26-cider-users-manual/26.18-nbjt.md)
  - 26.18.1 DESCRIPTION
  - 26.18.2 Parameters
  - 26.18.3 EXAMPLES
  - 26.18.4 SEE ALSO
  - 26.18.5 BUGS
- [26.19 NUMOS](26-cider-users-manual/26.19-numos.md)
  - 26.19.1 DESCRIPTION
  - 26.19.2 Parameters
  - 26.19.3 EXAMPLES
  - 26.19.4 SEE ALSO
- [26.20 2D contour plots](26-cider-users-manual/26.20-2d-contour-plots.md)
- [26.21 Cider examples](26-cider-users-manual/26.21-cider-examples.md)

## 27 Model and Device Parameters

- [27.1 Accessing internal device parameters](27-model-and-device-parameters/27.01-accessing-internal-device-parameters.md)
- [27.2 Elementary Devices](27-model-and-device-parameters/27.02-elementary-devices.md)
  - 27.2.1 Resistor
  - 27.2.2 Capacitor - Fixed capacitor
  - 27.2.3 Inductor - Fixed inductor
  - 27.2.4 Mutual - Mutual Inductor
- [27.3 Voltage and current sources](27-model-and-device-parameters/27.03-voltage-and-current-sources.md)
  - 27.3.1 Bxxxx - Arbitrary source (ASRC)
  - 27.3.2 Isource - Independent current source
  - 27.3.3 Vsource - Independent voltage source
  - 27.3.4 Fxxxx: Current-Controlled Current Source (CCCS)
  - 27.3.5 Hxxxx: Current-Controlled Voltage Source (CCVS)
  - 27.3.6 Gxxxx: Voltage-Controlled Current Source (VCCS)
  - 27.3.7 Exxxx: Voltage-Controlled Voltage Source (VCVS)
- [27.4 Transmission Lines](27-model-and-device-parameters/27.04-transmission-lines.md)
  - 27.4.1 CplLines - Simple Coupled Multiconductor Lines
  - 27.4.2 LTRA - Lossy transmission line
  - 27.4.3 Tranline - Lossless transmission line
  - 27.4.4 TransLine - Simple Lossy Transmission Line
  - 27.4.5 URC - Uniform R. C. line
- [27.5 BJTs](27-model-and-device-parameters/27.05-bjts.md)
  - 27.5.1 BJT - Bipolar Junction Transistor
  - 27.5.2 VBIC - Vertical Bipolar Inter-Company Model
- [27.6 MOSFETs](27-model-and-device-parameters/27.06-mosfets.md)
  - 27.6.1 MOS1 - Level 1 MOSFET model with Meyer capacitance model
  - 27.6.2 MOS2 - Level 2 MOSFET model with Meyer capacitance model
  - 27.6.3 MOS3 - Level 3 MOSFET model with Meyer capacitance model
  - 27.6.4 MOS6 - Level 6 MOSFET model with Meyer capacitance model
  - 27.6.5 MOS9 - Modified Level 3 MOSFET model
  - 27.6.6 BSIM1 - Berkeley Short Channel IGFET Model
  - 27.6.7 BSIM2 - Berkeley Short Channel IGFET Model
  - 27.6.8 BSIM3
  - 27.6.9 BSIM4

## 28 Compilation notes

- [28-compilation-notes.md](28-compilation-notes.md)
  - 28.1 Ngspice Installation under Linux (and other ’UNIXes’)
    - 28.1.1 Prerequisites
    - 28.1.2 Install from Git
    - 28.1.3 Install from a tarball, e.g. from ngspice-47.tar.gz
    - 28.1.4 Compilation using an user defined directory tree for object files
    - 28.1.5 ngspice as a shared library
    - 28.1.6 Relative paths for spinit and code models
    - 28.1.7 Installation on Red Hat or Oracle Linux (and similar, e.g. Centos)
    - 28.1.8 Advanced Install
  - 28.2 Ngspice Compilation under Windows OS
    - 28.2.1 Building ngspice with MS Visual Studio 2022/2026
    - 28.2.2 How to make ngspice with MINGW and MSYS2
    - 28.2.3 make ngspice with pure CYGWIN
    - 28.2.4 ngspice mingw or cygwin console executable w/o graphics
    - 28.2.5 ngspice for MS Windows, cross compiled from Linux
  - 28.3 Ngspice Compilation under macOS
    - 28.3.1 Compiling with Apple M2
    - 28.3.2 Compiling on (old) Intel Hardware: Prerequisites
    - 28.3.3 Compiling ngspice
    - 28.3.4 Compiling ngspice shared library
  - 28.4 Reporting errors

## 29 Copyrights and licenses

- [29-copyrights-and-licenses.md](29-copyrights-and-licenses.md)
  - 29.1 Documentation license
  - 29.2 ngspice license
  - 29.3 Some license details
    - 29.3.1 CC-BY-SA
    - 29.3.2 ‘Modified’ BSD license
  - 29.4 On the historical evolvement of the ngspice licenses
    - 29.4.1 XSPICE SOFTWARE (documentation) copyright
    - 29.4.2 CIDER RESEARCH SOFTWARE AGREEMENT (superseded by
    - 29.4.3 ‘Modified’ BSD license
    - 29.4.4 XSPICE
    - 29.4.5 OSDI
    - 29.4.6 tclspice, numparam
    - 29.4.7 Linking to GPLd libraries (e.g. readline, fftw, table.cm):
