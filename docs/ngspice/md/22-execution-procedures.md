# 22 Execution Procedures

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

This chapter covers operation of the XSPICE simulator and the Code Model Subsystem. It
begins with background material on simulation and modeling and then discusses the analysis
modes supported in XSPICE and the circuit description syntax used for modeling. Detailed
descriptions of the predefined Code Models and Node Types provided in the XSPICE libraries
are also included.

## 22.1 Simulation and Modeling Overview

This section introduces the concepts of circuit simulation and modeling. It is intended primarily
for users who have little or no previous experience with circuit simulators, and also for those
who have not used circuit simulators recently. However, experienced SPICE users may wish to
scan the material presented here since it provides background for new Code Model and User-
Defined Node capabilities of the XSPICE option.

### 22.1.1 Describing the Circuit

This section provides an overview of the circuit description syntax expected by the XSPICE
simulator. A general understanding of circuit description syntax will be helpful to you should
you encounter problems with your circuit and need to examine the simulator’s error messages,
or should you wish to develop your own models.
This section will introduce you to the creation of circuit description input files using the control
language user interface. Note that this material is presented in an overview form. Details of
circuit description syntax are given later in this chapter and in the previous chapters of this
manual.

#### 22.1.1.1 Example Circuit Description Input

Although different SPICE-based simulators may include various enhancements to the basic
version from the University of California at Berkeley, most use a similar approach in describing
circuits. This approach involves capturing the information present in a circuit schematic in
the form of a text file that follows a defined format. This format requires the assignment of

                                  Figure 22.1: Example Circuit 1

alphanumeric identifiers to each circuit node, the assignment of component identifiers to each
circuit device, and the definition of the significant parameters for each device. For example, the
circuit description below shows the equivalent input file for the circuit shown in Fig. 22.1.
Examples for control of a behavioral resistor:

        Small Signal Amplifier
        *
        * This circuit simulates a simple small signal amplifier.
        *
        Vin          Input 0                    0 SIN(0 .1 500Hz)
         _
        R source              _
                     Input Amp In               100
        C1           Amp_In 0                   1uF
         _   _          _
        R Amp Input Amp In 0                    1MEG
        E1               _           _
                     (Amp Out 0) (Amp In 0)    -10
        R_Load       Amp_Out 0                  1000

        .Tran 1.0u 0.01
        .end

This file exhibits many of the most important properties common to all SPICE circuit description
files including the following:

      • The first line of the file is always interpreted as the title of the circuit. The title may
        consist of any text string.

      • Lines that provide user comments, but no circuit information, are begun by an asterisk.

      • A circuit device is specified by a device name, followed by the node(s) to which it is
        connected, and then by any required parameter information.

      • The first character of a device name tells the simulator what kind of device it is (e.g. R =
        resistor, C = capacitor, E = voltage controlled voltage source).

      • Nodes may be labeled with any alphanumeric identifier. The only specific labeling re-
        quirement is that 0 must be used for ground.

    • A line that begins with a dot is a ‘control directive’ Control directives are used most
      frequently for specifying the type of analysis the simulator is to carry out.

    • An .end statement must be included at the end of the file.

    • With the exception of the Title and .end statements, the order in which the circuit file is
      defined is arbitrary.

    • All identifiers are case insensitive - the identifier ‘npn’ is equivalent to ‘NPN’ and to
      ‘nPn’.

    • Spaces and parenthesis are treated as white space.

    • Long lines may be continued on a succeeding line by beginning the next line with a ‘+’
      in the first column.

In this example, the title of the circuit is ‘Small Signal Amplifier’. Three comment lines are
included before the actual circuit description begins. The first device in the circuit is voltage
source Vin, which is connected between node Input and ‘0’ (ground). The parameters after
the nodes specify that the source has an initial value of 0, a wave shape of SIN, and a DC offset,
amplitude, and frequency of 0, .1, and 500 respectively. The next device in the circuit is resistor
R_Source, which is connected between nodes Input and Amp_In, with a value of 100 Ohms.
The remaining device lines in the file are interpreted similarly.
The control directive that begins with .tran specifies that the simulator should carry out a
simulation using the Transient analysis mode. In this example, the parameters to the transient
analysis control directive specify that the maximum time-step allowed is 1 microsecond and
that the circuit should be simulated for 0.01 seconds of circuit time.
Other control cards are used for other analysis modes. For example, if a frequency response plot
is desired, perhaps to determine the effect of the capacitor in the circuit, the following statement
will instruct the simulator to perform a frequency analysis from 100 Hz to 10 MHz in decade
intervals with ten points per decade.

      .ac dec 10 100 10meg

To determine the quiescent operating point of the circuit, the following statement may be inserted
in the file.

      .op

A fourth analysis type supported by ngspice is swept DC analysis. An example control statement
for the analysis mode is

      .dc Vin -0.1 0.2 .05

This statement specifies a DC sweep that varies the source Vin from -100 millivolts to +200
millivolts in steps of 50 millivolts.

#### 22.1.1.2 Models and Subcircuits

The file discussed in the previous section illustrated the most basic syntax rules of a circuit
description file. However, ngspice (and other SPICE-based simulators) include many other features
that allow for accurate modeling of semiconductor devices such as diodes and transistors
and for grouping elements of a circuit into a macro or ‘subcircuit’ description that can be reused
throughout a circuit description. For instance, the file shown below is a representation of the
schematic shown in Fig. 22.2.
Examples for control of a behavioral resistor:

      Small Signal Amplifier with Limit Diodes
      *
      * This circuit simulates a small signal amplifier
      * with a diode limiter.
      *
      .dc Vin -1 1 .05

      Vin          Input 0 DC                   0
      R_source     Input Amp_In               100
      D_Neg        0 Amp_In                   1n4148
      D_Pos        Amp_In 0                   1n4148
      C1           Amp_In 0                   1uF
      X1           Amp_In 0 Amp_Out           Amplifier
      R_Load       Amp_Out 0                  1000

      .model 1n4148 D (is=2.495e-09 rs=4.755e-01 n=1.679e+00
      + tt=3.030e-09 cjo=1.700e-12 vj=1 m=1.959e-01 bv=1.000e+02
      + ibv=1.000e-04)

      .subckt Amplifier Input Common Output
      E1        (Output Common) (Input Common) -10
       _
      R Input   Input           Common 1meg
      .ends Amplifier

      .end

This is the same basic circuit as in the initial example, with the addition of two components and
some changes to the simulation file. The two diodes have been included to illustrate the use of
device models, and the amplifier is implemented with a subcircuit. Additionally, this file shows
the use of the swept DC control card.

Device Models Device models allow you to specify, when required, many of the parameters
of the devices being simulated. In this example, model statements are used to define the silicon
diodes. Electrically, the diodes serve to limit the voltage at the amplifier input to values between
about ±700 millivolts. The diode is simulated by first declaring the ‘instance’ of each diode
with a device statement. Instead of attempting to provide parameter information separately for
both diodes, the label ‘1n4148’ alerts the simulator that a separate model statement is included

                                  Figure 22.2: Example Circuit 2

in the file that provides the necessary electrical specifications for the device (‘1n4148’ is the
part number for the type of diode the model is meant to simulate).
The model statement that provides this information is:

      .model 1n4148 D (is=2.495e-09 rs=4.755e-01 n=1.679e+00
      + tt=3.030e-09 cjo=1.700e-12 vj=1 m=1.959e-01
      + bv=1.000e+02 ibv=1.000e-04)

The model statement always begins with the string .model followed by an identifier and the
model type (D for diode, NPN for NPN transistors, etc).
The optional parameters (‘is’, ‘rs’, ‘n’, . . . ) shown in this example configure the simulator’s
mathematical model of the diode to match the specific behavior of a particular part (e.g. a
‘1n4148’).

Subcircuits In some applications, describing a device by embedding the required elements
in the main circuit file, as is done for the amplifier in Fig. 22.1, is not desirable. A hierarchical
approach may be taken by using subcircuits. An example of a subcircuit statement is shown in
the second circuit file:

      X1 Amp_In 0 Amp_Out

Amplifier Subcircuits are always identified by a device label beginning with ‘X’. Just as with
other devices, all of the connected nodes are specified. Notice, in this example, that three nodes
are used. Finally, the name of the subcircuit is specified. Elsewhere in the circuit file, the
simulator looks for a statement of the form:

      .subckt <Name> <Node1> <Node2> <Node3> ...

This statement specifies that the lines that follow are part of the Amplifier subcircuit, and that the
three nodes listed are to be treated wherever they occur in the subcircuit definition as referring,
respectively, to the nodes on the main circuit from which the subcircuit was called. Normal
device, model, and comment statements may then follow. The subcircuit definition is concluded
with a statement of the form:

      .ends <Name>

#### 22.1.1.3 XSPICE Code Models

In the previous example, the specification of the amplifier was accomplished by using a ngspice
Voltage Controlled Voltage Source device. This is an idealization of the actual amplifier. Practical
amplifiers include numerous non-ideal effects, such as offset error voltages and non-ideal
input and output impedances. The accurate simulation of complex, real-world components can
lead to cumbersome subcircuit files, long simulation run times, and difficulties in synthesizing
the behavior to be modeled from a limited set of internal devices known to the simulator.
To address these problems, XSPICE allows you to create Code Models that simulate complex,
non-ideal effects without the need to develop a subcircuit design. For example, the following file
provides simulation of the circuit in Fig. 22.2, but with the subcircuit amplifier replaced with
a Code Model called ‘Amp’ that models several non-ideal effects including input and output
impedance and input offset voltage.

      Small Signal Amplifier
      *
      * This circuit simulates a small signal amplifier
      * with a diode limiter.
      *
      .dc Vin -1 1 .05

      Vin          Input 0                   DC 0
      R_source     Input Amp_In              100
      D_Neg 0      Amp_In                    1n4148
      D_Pos        Amp_In 0                  1n4148
      C1           Amp_In 0                  1uF
      A1           Amp_In 0 Amp_Out          Amplifier
      R_Load       Amp_Out 0                 1000

      .model 1n4148 D (is=2.495e-09 rs=4.755e-01 n=1.679e+00
      + tt=3.030e-09 cjo=1.700e-12 vj=1 m=1.959e-01 bv=1.000e+02
      + ibv=1.000e-04)

      .model Amplifier Amp (gain = -10 in_offset = 1e-3
      +                     rin = 1meg rout = 0.4)
      .end

A statement with a device label beginning with ‘A’ alerts the simulator that the device uses
a Code Model. The model statement is similar in form to the one used to specify the diode.
The model label ‘Amp’ directs XSPICE to use the code model with that name. Parameter
information has been added to specify a gain of -10, an input offset of 1 millivolt, an input
impedance of 1 meg ohm, and an output impedance of 0.4 ohm. Subsequent sections of this
document detail the steps required to create such a Code Model and include it in the XSPICE
simulator.

#### 22.1.1.4 Node Bridge Models

When a mixed-mode simulator is used, some method must be provided for translating data
between the different simulation algorithms. XSPICE’s Code Model support allows you to
develop models that work under the analog simulation algorithm, the event-driven simulation
algorithm, or both at once.
In XSPICE, models developed for the express purpose of translating between the different algorithms
or between different User-Defined Node types are called ‘Node Bridge’ models. For
translations between the built-in analog and digital types, predefined node bridge models are
included in the XSPICE Code Model Library.

#### 22.1.1.5 Practical Model Development

In practice, developing models often involves using a combination of ngspice passive devices,
device models, subcircuits, and XSPICE Code Models. XSPICE’s Code Models may be seen
as an extension to the set of device models offered in standard ngspice. The collection of
over 40 predefined Code Models included with XSPICE provides you with an enriched set of
modeling primitives with which to build subcircuit models. In general, you should first attempt
to construct your models from these available primitives. This is often the quickest and easiest
method.
If you find that you cannot easily design a subcircuit to accomplish your goal using the available
primitives, then you should turn to the code modeling approach. Because they are written in a
general purpose programming language (C), code models enable you to simulate virtually any
behavior for which you can develop a set of equations or algorithms.

## 22.2 Circuit Description Syntax

If you need to debug a simulation, if you are planning to develop your own models, or if you
are using the XSPICE simulator through the control language user interface, you will need to
become familiar with the circuit description language.
The previous sections presented example circuit description input files. The following sections
provide more detail on XSPICE circuit descriptions with particular emphasis on the syntax for
creating and using models. First, the language and syntax of the ngspice simulator are described
and references to additional information are given. Next, XSPICE extensions to the ngspice
syntax are detailed. Finally, various enhancements to ngspice operation are discussed including
polynomial sources, arbitrary phase sources, supply ramping, matrix conditioning, convergence
options, and debugging support.

### 22.2.1 XSPICE Syntax Extensions

In the preceding discussion, ngspice syntax was reviewed, and those features of ngspice that are
specifically supported by the XSPICE simulator were enumerated. In addition to these features,
there exist extensions to the ngspice capabilities that provide much more flexibility in describing
and simulating a circuit. The following sections describe these capabilities, as well as the syntax
required to make use of them.

#### 22.2.1.1 Convergence Debugging Support

When a simulation is failing to converge, the simulator can be asked to return convergence
diagnostic information that may be useful in identifying the areas of the circuit in which convergence
problems are occurring. When running through the interactive user interface, these
messages are written directly to the terminal.

#### 22.2.1.2 Digital Nodes

Support is included for digital nodes that are simulated by an event-driven algorithm. Because
the event-driven algorithm is faster than the standard SPICE matrix solution algorithm, and
because all digital, real, int and User-Defined Node types make use of the event-driven
algorithm, reduced simulation time for circuits that include these models can be anticipated
compared to simulation of the same circuit using analog code models and nodes.

#### 22.2.1.3 User-Defined Nodes

Support is provided for User Defined Nodes that operate with the event-driven algorithm. These
nodes allow the passing of arbitrary data structures among models. The real and integer node
types supplied with XSPICE are actually predefined User-Defined Node types.

#### 22.2.1.4 Supply Ramping

A supply ramping function is provided by the simulator as an option to a transient analysis
to simulate the turn-on of power supplies to a board level circuit. To enable this option, the
compile time flag XSPICE_EXP has to be set, e.g. by adding CFLAGS="-DXSPICE_EXP" to
the ./configure command line. The supply ramping function linearly ramps the values of all
independent sources and the capacitor and inductor code models (code model extension) with
initial conditions toward their final value at a rate that you define. A complete ngspice deck
example of usage of the ramptime option is shown below.

            Example:

            Supply ramping option
            *
            * This circuit demonstrates the use of the option
            * "ramptime" that ramps independent sources and the
            * capacitor and inductor initial conditions from
            * zero to their final value during the time period
            * specified.
            *
            *
            .tran 0.1 5
            .option ramptime=0.2
            * a1 1 0 cap
            .model cap capacitor (c=1000uf ic=1)
            r1 1 0 1k
            *
            a2 2 0 ind
            .model ind inductor (l=1H ic=1)
            r2 2 0 1.0
            *
            v1 3 0 1.0
            r3 3 0 1k
            *
            i1 4 0 1e-3
            r4 4 0 1k
            *
            v2 5 0 0.0 sin(0 1 0.3 0 0 45.0)
            r5 5 0 1k
            *
            .end

## 22.3 How to create code models

The following instruction to create an additional code model uses the ngspice infrastructure and
some ’intelligent’ copy and paste. As an example an extra code model d_xxor is created in the
xtradev shared library, reusing the existing d_xor model from the digital library. More detailed
information will be made available in Chapt. 24.
You should have downloaded ngspice, either the most recent distribution or from the Git repository,
and compiled and installed it properly according to your operating system and the instructions
given in Chapt. 28 of the Appendix, especially Chapt. 28.1.4 (for Linux users), or
Chapt. 28.2.2 for MINGW and MS Windows. (MS Visual Studio will not do, because we
have not yet integrated the code model generator into this compiler! You may however use
all code models later with any ngspice executable.) Then change into directory ngspice/src/xspice/icm/xtradev.
Create a new directory
mkdir d_xxor

Copy the two files cfunc.mod and ifspec.ifs from ngspice/src/xspice/icm/digital/d_xor to
ngspice/src/xspice/icm/xtradev/d_xxor. These two files may serve as a template for your
new model!

For simplicity reasons we do only a very simple editing to these files here, in fact the functionality
is not changed, just the name translated to a new model. Edit the new cfunc.mod: In lines
5, 28, 122, 138, 167, 178 replace the old name (d_xor) by the new name d_xxor. Edit the new
ifspec.ifs: In lines 16, 23, 24 replace cm_d_xor by cm_d_xxor and d_xor by d_xxor.

Make ngspice aware of the new code model by editing file
ngspice/src/xspice/icm/xtradev/modpath.lst:

Add a line with the new model name d_xxor.

Redo ngspice by entering directory ngspice/release, and issuing the commands:

make

sudo make install

And that’s it! In ngspice/release/src/xspice/icm/xtradev/ you now will find cfunc.c and
ifspec.c and the corresponding object files. The new code model d_xxor resides in the shared
library xtradev.cm, and is available after ngspice is started. As a test example you may edit
ngspice/src/xspice/examples/digital_models1.deck, and change line 60 to the new model:

.model d_xor1 d_xxor (rise_delay=1.0e-6 fall_delay=2.0e-6 input_load=1.0e-12)

The complete input file follows:

            Code Model Test: new xxor
            *
            *** analysis type ***
            .tran .01s 4s
            *
            *** input sources ***
            *
            v2 200 0 DC PWL( (0 0.0) (2 0.0) (2.0000000001 1.0) (3 1.0) )
            *
            v1 100 0 DC PWL( (0 0.0) (1.0 0.0) (1.0000000001 1.0) (2 1.0)
            +     (2.0000000001 0.0) (3 0.0) (3.0000000001 1.0) (4 1.0) )
            *
            *** resistors to ground ***
            r1 100 0 1k
            r2 200 0 1k
            *
            *** adc_bridge blocks ***
            aconverter [200 100] [2 1] adc_bridge1
            .model adc_bridge1 adc_bridge (in_low=0.1 in_high=0.9
            +                  rise_delay=1.0e-12 fall_delay=1.0e-12)
            *
            *** xor block ***
            a7 [1 2] 70 d_xor1
            .model d_xor1 d_xxor (rise_delay=1.0e-6 fall_delay=2.0e-6
            +                    input_load=1.0e-12)
            *
            *** dac_bridge blocks ****
            abridge1 [70] [out] dac1
            .model dac1 dac_bridge(out_low = 0.7 out_high = 3.5
            + out_undef = 2.2 input_load = 5.0e-12 t_rise = 50e-9
            + t_fall = 20e-9)
            *
            *** simulation and plotting ***
            .control
            run
            plot allv
            .endc
            *
            .end

An analog input, delivered by the pwl voltage sources, is transformed into the digital domain
by an adc_bridge, processed by the new code model d_xxor, and then translated back into the
analog domain.
If you want to change the functionality of the new model, you have to edit ifspec.ifs for the
code model interface and cfunc.mod for the detailed functionality of the new model. Please see
Chapt. 24, especially Chapt. 24.6 ff. for any details. And of course you may take the existing

analog, digital, mixed signal and other existing code models (to be found in the subdirectories
to ngspice/release/src/xspice/icm) as stimulating examples for your work.
