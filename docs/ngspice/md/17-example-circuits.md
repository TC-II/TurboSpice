# 17 Example Circuits

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

This section starts with an ngspice example to walk you through the basic features of ngspice
using its command line user interface. The operation of ngspice will be illustrated through
several examples (Chapt. 17.1 to 17.7).

The first example uses the simple one-transistor amplifier circuit illustrated in Fig. 17.1. This
circuit is constructed entirely with ngspice compatible devices and is used to introduce basic
concepts, including:

    • Invoking the simulator:

    • Running simulations in different analysis modes

    • Printing and plotting analog results

    • Examining status, including execution time and memory usage

    • Exiting the simulator

The remainder of the section (from Chapt. 17.1 onward) lists several circuits, which have been
accompanying any ngspice distribution, and may be regarded as the ‘classical’ SPICE circuits.

## 17.1 AC coupled transistor amplifier

The circuit shown in Fig. 17.1 is a simple one-transistor amplifier. The input signal is amplified
with a gain of approximately -(Rc/Re) = -(3.9K/1K) = -3.9. The circuit description file for this
example is shown below.

                    Figure 17.1: Transistor Amplifier Simulation Example

Example:

      A Berkeley SPICE3 compatible circuit
      *
      * This circuit contains only Berkeley SPICE3 components.
      *
      * The circuit is an AC coupled transistor amplifier with
      * a sinewave input at node "1", a gain of approximately -3.9,
      * and output on node "coll".
      *
      .tran 1e-5 2e-3
      *
      vcc vcc 0 12.0
      vin 1 0 0.0 ac 1.0 sin(0 1 1k)
      ccouple 1 base 10uF
      rbias1 vcc base 100k
      rbias2 base 0 24k
      q1 coll base emit generic
      rcollector vcc coll 3.9k
      remitter emit 0 1k
      *
      .model generic npn
      *
      .end

To simulate this circuit, move into a directory under your user account and copy the file xspice_c1.cir

from directory /examples/xspice/. This file stems from the original XSPICE introduction,
therefore its name, but you do not need to have a version of ngspice with the XSPICE option to
run it.

      $ cp /examples/xspice/xspice_c1.cir xspice_c1.cir

Now invoke the simulator on this circuit as follows:

      $ ngspice xspice_c1.cir

After a few moments, you should see the ngspice prompt:

      ngspice 1 ->

At this point, ngspice has read-in the circuit description and checked it for errors. If any errors
had been encountered, messages describing them would have been output to your terminal.
Since no messages were printed for this circuit, the syntax of the circuit description was correct.
To see the circuit description read by the simulator you can issue the following command:

      ngspice 1 -> listing

The simulator shows you the circuit description currently in memory:

      a berkeley spice3 compatible circuit
       1 : a berkeley spice3 compatible circuit
       2 : .global gnd
      10 : .tran 1e-5 2e-3
      12 : vcc vcc 0 12.0
      13 : vin 1 0 0.0 ac 1.0 sin(0 1 1k)
      14 : ccouple 1 base 10uf
      15 : rbias1 vcc base 100k
      16 : rbias2 base 0 24k
      17 : q1 coll base emit generic
      18 : rcollector vcc coll 3.9k
      19 : remitter emit 0 1k
      21 : .model generic npn
      24 : .end

The title of this circuit is ‘A Berkeley SPICE3 compatible circuit’. The circuit description
contains a transient analysis control command .TRAN 1E-5 2E-3 requesting a total simulated
time of 2ms with a maximum time-step of 10us. The remainder of the lines in the circuit
description describe the circuit of Fig. 17.1.
Now, execute the simulation by entering the run command:

      ngspice 1 -> run

The simulator will run the simulation and when execution is completed, will return with the
ngspice prompt. When the prompt returns, issue the rusage command again to see how much
time and memory has been used now.

To examine the results of this transient analysis, we can use the plot command. First we will
plot the nodes labeled ‘1’ and ‘base’.

      ngspice 2 -> plot v(1) base

The simulator responds by displaying an X Window System plot similar to that shown in Fig.
17.2.

                       Figure 17.2: node 1 and node ’base’ versus time

Notice that we have named one of the nodes in the circuit description with a number (‘1’),
while the others are words (‘base’). This was done to illustrate ngspice’s special requirements
for plotting nodes labeled with numbers. Numeric labels are allowed in ngspice for backwards
compatibility with SPICE2. However, they require special treatment in some commands such
as plot. The plot command is designed to allow expressions in its argument list in addition to
names of results data to be plotted. For example, the expression plot (base - 1) would plot
the result of subtracting 1 from the value of node ‘base’.
If we had desired to plot the difference between the voltage at node ‘base’ and node ‘1’, we
would need to enclose the node name ‘1’ in the construction v( ) producing a command such
as plot (base - v(1)).
Now, issue the following command to examine the voltages on two of the internal nodes of the
transistor amplifier circuit:

      ngspice 3 -> plot vcc coll emit

The plot shown in Fig. 17.3 should appear. Notice in the circuit description that the power
supply voltage source and the node it is connected to both have the name ‘vcc’. The plot
command above has plotted the node voltage ‘vcc’. However, it is also possible to plot branch
currents through voltage sources in a circuit. ngspice always adds the special suffix #branch to
voltage source names. Hence, to plot the current into the voltage source named vcc, we would
use a command such as plot vcc#branch.

                       Figure 17.3: VCC, Collector and Emitter Voltages

Now let’s run a simple DC simulation of this circuit and examine the bias voltages with the
print command. One way to do this is to quit the simulator using the quit command, edit
the input file to change the .tran line to .op (for ’operating point analysis’), re-invoke the
simulator, and then issue the run command. However, ngspice allows analysis mode changes
directly from the ngspice prompt. All that is required is to enter the control line, e.g. op (without
the leading ‘.’). ngspice will interpret the information on the line and start the new analysis run
immediately, without the need to enter a new run command.
To run the DC simulation of the transistor amplifier, issue the following command:

      ngspice 4 -> op

After a moment the ngspice prompt returns. Now issue the print command to examine the
emitter, base, and collector DC bias voltages.

      ngspice 5 -> print emit base coll

ngspice responds with:

      emit = 1.293993e+00 base = 2.074610e+00 coll = 7.003393e+00

To run an AC analysis, enter the following command:

      ngspice 6 -> ac dec 10 0.01 100

This command runs a small-signal swept AC analysis of the circuit to compute the magnitude
and phase responses. In this example, the sweep is logarithmic with ‘decade’ scaling, 10 points
per decade, and lower and upper frequencies of 0.01 Hz and 100 Hz. Since the command
sweeps through a range of frequencies, the results are vectors of values and are examined with
the plot command. Issue to the following command to plot the response curve at node ‘coll’:

      ngspice 7 -> plot coll

This plot shows the AC gain from input to the collector. (Note that our input source in the circuit
description ‘vin’ contained parameters of the form ‘AC 1.0’ designating that a unit-amplitude
AC signal was applied at this point.) For plotting data from an AC analysis, ngspice chooses
automatically a logarithmic scaling for the frequency (x) axis.
To produce a more traditional ‘Bode’ gain phase plot (again with automatic logarithmic scaling
on the frequency axis), we use the expression capability of the plot command and the built-in
ngspice functions db( ) and ph( ):

      ngspice 8 -> plot db(coll) ph(coll)

The last analysis supported by ngspice is a swept DC analysis. To perform this analysis, issue
the following command:

      ngspice 9 -> dc vcc 0 15 0.1

This command sweeps the supply voltage ‘vcc’ from 0 to 15 volts in 0.1 volt increments. To
plot the results, issue the command:

      ngspice 10 -> plot emit base coll

Finally, to exit the simulator, use the quit command, and you will be returned to the operating
system prompt.

      ngspice 11 -> quit

So long.

## 17.2 Differential Pair

The following deck determines the dc operating point of a simple differential pair. In addition,
the ac small-signal response is computed over the frequency range 1Hz to 100MEGHz.
Example:

      SIMPLE DIFFERENTIAL PAIR
      VCC 7 0 12
      VEE 8 0 -12
      VIN 1 0 AC 1
      RS1 1 2 1K
      RS2 6 0 1K
      Q1 3 2 4 MOD1
      Q2 5 6 4 MOD1
      RC1 7 3 10K
      RC2 7 5 10K
      RE 4 8 10K
      .MODEL MOD1 NPN BF=50 VAF=50 IS=1.E-12 RB=100 CJC=.5PF TF=.6NS
      .TF V(5) VIN
      .AC DEC 10 1 100MEG
      .END

## 17.3 MOSFET Characterization

The following deck computes the output characteristics of a MOSFET device over the range
0-10V for VDS and 0-5V for VGS.
Example:

      MOS OUTPUT CHARACTERISTICS
      .OPTIONS NODE NOPAGE
      VDS 3 0
      VGS 2 0
      M1 1 2 0 0 MOD1 L=4U W=6U AD=10P AS=10P
      * VIDS MEASURES ID, WE COULD HAVE USED VDS,
      * BUT ID WOULD BE NEGATIVE
      VIDS 3 1
      .MODEL MOD1 NMOS VTO=-2 NSUB=1.0E15 UO=550
      .DC VDS 0 10 .5 VGS 0 5 1
      .END

## 17.4 RTL Inverter

The following deck determines the dc transfer curve and the transient pulse response of a simple
RTL inverter. The input is a pulse from 0 to 5 Volts with delay, rise, and fall times of 2ns and

a pulse width of 30ns. The transient interval is 0 to 100ns, with printing to be done every
nanosecond.

Example:

      SIMPLE RTL INVERTER
      VCC 4 0 5
      VIN 1 0 PULSE 0 5 2NS 2NS 2NS 30NS
      RB 1 2 10K
      Q1 3 2 0 Q1
      RC 3 4 1K
      .MODEL Q1 NPN BF 20 RB 100 TF .1NS CJC 2PF
      .DC VIN 0 5 0.1
      .TRAN 1NS 100NS
      .END

## 17.5 Four-Bit Binary Adder (Bipolar)

The following deck simulates a four-bit binary adder, using several subcircuits to describe various
pieces of the overall circuit.

Example:

      ADDER - 4 BIT ALL-NAND-GATE BINARY ADDER
      *** SUBCIRCUIT DEFINITIONS
      .SUBCKT NAND 1 2 3 4
      * NODES: INPUT(2), OUTPUT, VCC
      Q1 9 5 1 QMOD
      D1CLAMP 0 1 DMOD
      Q2 9 5 2 QMOD
      D2CLAMP 0 2 DMOD
      RB 4 5 4K
      R1 4 6 1.6K
      Q3 6 9 8 QMOD
      R2 8 0 1K
      RC 4 7 130
      Q4 7 6 10 QMOD
      DVBEDROP 10 3 DMOD
      Q5 3 8 0 QMOD
      .ENDS NAND

Continue 4 Bit adder:

     .SUBCKT ONEBIT 1 2 3 4 5 6
     * NODES: INPUT(2), CARRY-IN, OUTPUT, CARRY-OUT, VCC
     X1 1 2 7 6 NAND
     X2 1 7 8 6 NAND
     X3 2 7 9 6 NAND
     X4 8 9 10 6 NAND
     X5 3 10 11 6 NAND
     X6 3 11 12 6 NAND
     X7 10 11 13 6 NAND
     X8 12 13 4 6 NAND
     X9 11 7 5 6 NAND
     .ENDS ONEBIT

     .SUBCKT TWOBIT 1 2 3 4 5 6 7 8 9
     * NODES: INPUT - BIT0(2) / BIT1(2), OUTPUT - BIT0 / BIT1,
     * CARRY-IN, CARRY-OUT, VCC
     X1 1 2 7 5 10 9 ONEBIT
     X2 3 4 10 6 8 9 ONEBIT
     .ENDS TWOBIT

     .SUBCKT FOURBIT 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
     * NODES: INPUT - BIT0(2) / BIT1(2) / BIT2(2) / BIT3(2),
     * OUTPUT - BIT0 / BIT1 / BIT2 / BIT3, CARRY-IN, CARRY-OUT, VCC
     X1 1 2 3 4 9 10 13 16 15 TWOBIT
     X2 5 6 7 8 11 12 16 14 15 TWOBIT
     .ENDS FOURBIT

     *** DEFINE NOMINAL CIRCUIT
     .MODEL DMOD D
     .MODEL QMOD NPN(BF=75 RB=100 CJE=1PF CJC=3PF)
     VCC 99 0 DC 5V
     VIN1A 1 0 PULSE(0 3 0 10NS 10NS 10NS 50NS)
     VIN1B 2 0 PULSE(0 3 0 10NS 10NS 20NS 100NS)
     VIN2A 3 0 PULSE(0 3 0 10NS 10NS 40NS 200NS)
     VIN2B 4 0 PULSE(0 3 0 10NS 10NS 80NS 400NS)
     VIN3A 5 0 PULSE(0 3 0 10NS 10NS 160NS 800NS)
     VIN3B 6 0 PULSE(0 3 0 10NS 10NS 320NS 1600NS)
     VIN4A 7 0 PULSE(0 3 0 10NS 10NS 640NS 3200NS)
     VIN4B 8 0 PULSE(0 3 0 10NS 10NS 1280NS 6400NS)
     X1 1 2 3 4 5 6 7 8 9 10 11 12 0 13 99 FOURBIT
     RBIT0 9 0 1K
     RBIT1 10 0 1K
     RBIT2 11 0 1K
     RBIT3 12 0 1K
     RCOUT 13 0 1K

     *** (FOR THOSE WITH MONEY (AND MEMORY) TO BURN)
     .TRAN 1NS 6400NS
     .END

## 17.6 Four-Bit Binary Adder (MOS)

The following deck simulates a four-bit binary adder, using several subcircuits to describe various
pieces of the overall circuit.

Example:

        ADDER - 4 BIT ALL-NAND-GATE BINARY ADDER
      *** SUBCIRCUIT DEFINITIONS
      .SUBCKT NAND in1 in2 out VDD
      * NODES: INPUT(2), OUTPUT, VCC
      M1 out in2 Vdd Vdd p1 W=7.5u L=0.35u pd=13.5u ad=22.5p
      + ps=13.5u as=22.5p
      M2 net.1 in2 0 0 n1   W=3u   L=0.35u pd=9u    ad=9p
      + ps=9u     as=9p
      M3 out in1 Vdd Vdd p1 W=7.5u L=0.35u pd=13.5u ad=22.5p
      + ps=13.5u as=22.5p
      M4 out in1 net.1 0 n1 W=3u   L=0.35u pd=9u    ad=9p
      + ps=9u     as=9p
      .ENDS NAND
      .SUBCKT ONEBIT 1 2 3 4 5 6 AND
      X2   1 7 8 6      NAND
      X3   2 7 9 6      NAND
      X4   8 9 10 6     NAND
      X5   3 10 11 6    NAND
      X6   3 11 12 6    NAND
      X7 10 11 13 6     NAND
      X8 12 13 4 6      NAND
      X9 11 7 5 6       NAND
      .ENDS ONEBIT
      .SUBCKT TWOBIT 1 2 3 4 5 6 7 8 9
      * NODES: INPUT - BIT0(2) / BIT1(2), OUTPUT - BIT0 / BIT1,
      *         CARRY-IN, CARRY-OUT, VCC
      X1   1 2 7 5 10 9       ONEBIT
      X2   3 4 10 6 8 9       ONEBIT
      .ENDS TWOBIT
      .SUBCKT FOURBIT 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
      *NODES: INPUT - BIT0(2) / BIT1(2) / BIT2(2) / BIT3(2),
      *       OUTPUT - BIT0 / BIT1 / BIT2 / BIT3, CARRY-IN,
      *       CARRY-OUT, VCC
      X1   1 2 3 4 9 10 13 16 15       TWOBIT
      X2   5 6 7 8 11 12 16 14 15      TWOBIT
      .ENDS FOURBIT

Continue 4 Bit adder MOS:

      *** POWER
      VCC   99 0    DC 3.3V
      *** INPUTS
      VIN1A 1 0     DC 0 PULSE(0 3 0 5NS 5NS   20NS   50NS)
      VIN1B 2 0     DC 0 PULSE(0 3 0 5NS 5NS   30NS 100NS)
      VIN2A 3 0     DC 0 PULSE(0 3 0 5NS 5NS   50NS 200NS)
      VIN2B 4 0     DC 0 PULSE(0 3 0 5NS 5NS   90NS 400NS)
      VIN3A 5 0     DC 0 PULSE(0 3 0 5NS 5NS 170NS 800NS)
      VIN3B 6 0     DC 0 PULSE(0 3 0 5NS 5NS 330NS 1600NS)
      VIN4A 7 0     DC 0 PULSE(0 3 0 5NS 5NS 650NS 3200NS)
      VIN4B 8 0     DC 0 PULSE(0 3 0 5NS 5NS 1290NS 6400NS)
      *** DEFINE NOMINAL CIRCUIT
      X1     1 2 3 4 5 6 7 8 9 10 11 12 0 13 99 FOURBIT

      .option acct
      .save V(1) V(2) V(3) V(4) V(5) V(6) V(7) V(8) $ INPUTS
      .save V(9) V(10) V(11) V(12) V(13) $ OUTPUTS

      .TRAN 1NS 6400NS

      * use BSIM3 model with default parameters
      .model n1 nmos level=49 version=3.3.0
      .model p1 pmos level=49 version=3.3.0

      .END

## 17.7 Transmission-Line Inverter

The following deck simulates a transmission-line inverter. Two transmission-line elements are
required since two propagation modes are excited. In the case of a coaxial line, the first line
(T1) models the inner conductor with respect to the shield, and the second line (T2) models the
shield with respect to the outside world.

Example:

      Transmission-line inverter

      v1 1 0 pulse(0 1 0 0.1n)
      r1 1 2 50
      x1 2 0 0 4 tline
      r2 4 0 50

      .subckt tline 1 2 3 4
      t1 1 2 3 4 z0=50 td=1.5ns
      t2 2 0 4 0 z0=100 td=1ns
      .ends tline

      .tran 0.1ns 20ns
      .end
