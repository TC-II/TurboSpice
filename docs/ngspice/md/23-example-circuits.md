# 23 Example circuits

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

The following chapter is designed to demonstrate XSPICE features. The first example circuit
models the circuit of Fig. 22.2 using the XSPICE gain block code model to substitute for the
more complex and computationally expensive ngspice transistor model. This example illustrates
one way in which XSPICE code models can be used to raise the level of abstraction in
circuit modeling to improve simulation speed.
The next example, shown in Fig. 23.1, illustrates many of the more advanced features offered by
XSPICE. This circuit is a mixed-mode design incorporating digital data, analog data, and User-
Defined Node data together in the same simulation. Some of the important features illustrated
include:

    • Creating and compiling Code Models
    • Creating an XSPICE executable that incorporates these new models
    • The use of ‘node bridge’ models to translate data between the data types in the simulation
    • Plotting analog and event-driven (digital and User-Defined Node) data
    • Using the eprint command to print event-driven data

Throughout these examples, we assume that ngspice with XSPICE option has already been
installed on your system and that your user account has been set up with the proper search path
and environment variable data.
The examples also assume that you are running under Linux and will use standard Linux commands
such as cp for copying files, etc. If you are using a different set up, with different operating
system command names, you should be able to translate the commands shown into those
suitable for your installation. Finally, file system path-names given in the examples assume
that ngspice + XSPICE has been installed on your system in directory /usr/local/xspice-1-0.
If your installation is different, you should substitute the appropriate root path-name where
appropriate.

## 23.1 Amplifier with XSPICE model ‘gain’

The circuit, as has been shown in Fig. 22.2, is extended here by using the XSPICE code model
gain. The ngspice circuit description for this circuit is shown below.

Example:

      A transistor amplifier circuit
      *
      .tran 1e-5 2e-3
      *
      vin 1 0 0.0 ac 1.0 sin(0 1 1k)
      *
      ccouple 1 in 10uF
      rzin in 0 19.35k
      *
      aamp in aout gain_block
      .model gain_block gain (gain = -3.9 out_offset = 7.003)
      *
      rzout aout coll 3.9k
      rbig coll 0 1e12
      *
      .end

Notice the component ‘aamp’. This is an XSPICE code model device. All XSPICE code model
devices begin with the letter ‘a’ to distinguish them from other ngspice devices. The actual
code model used is referenced through a user-defined identifier at the end of the line - in this
case gain_block. The type of code model used and its parameters appear on the associated
.model card. In this example, the gain has been specified as -3.9 to approximate the gain of the
transistor amplifier, and the output offset (out_offset) has been set to 7.003 according to the DC
bias point information obtained from the DC analysis in Example 1 from Chapter 22.
Notice also that input and output impedances of the one-transistor amplifier circuit are modeled
with the resistors ‘rzin’ and ‘rzout’, since the gain code model defaults to an ideal voltageinput,
voltage-output device with infinite input impedance and zero output impedance.
Lastly, note that a special resistor ‘rbig’ with value ‘1e12’ has been included at the opposite side
of the output impedance resistor ‘rzout’. This resistor is required by ngspice’s matrix solution
formula. Without it, the resistor ‘rzout’ would have only one connection to the circuit, and
an ill-formed matrix could result. One way to avoid such problems without adding resistors
explicitly is to use the ngspice ‘rshunt’ option described in this document under ngspice Syntax
Extensions/General Enhancements.
To simulate this circuit, copy the file xspice_c2.cir from the directory /src/xspice/examples
into a directory in your account.

      $ cp /examples/xspice/xspice_c2.cir xspice_c2.cir

Invoke the simulator on this circuit:

      $ ngspice xspice_c2.cir

After a few moments, you should see the ngspice prompt:

      ngspice 1 ->

Now issue the run command and when the prompt returns, issue the plot command to examine
the voltage at the node ‘coll’.

      ngspice 1 -> run
      ngspice 2 -> plot coll

The resulting waveform closely matches that from the original transistor amplifier circuit simulated
in Example 1.

When you are done, enter the quit command to leave the simulator and return to the command
line.

      ngspice 3 -> quit

Using the rusage command, you can verify that this abstract model of the transistor amplifier
runs somewhat faster than the full circuit of Example 1. This is because the code model is less
complex computationally. This demonstrates one important use of XSPICE code models - to
reduce run time by modeling circuits at a higher level of abstraction. Speed improvements vary
and are most pronounced when a large amount of low-level circuitry can be replaced by a small
number of code models and additional components.

## 23.2 XSPICE advanced usage

### 23.2.1 Circuit example C3

An equally important use of code models is in creating models for circuits and systems that do
not easily lend themselves to synthesis using standard ngspice primitives (resistors, capacitors,
diodes, transistors, etc.). This occurs often when trying to create models of ICs for use in simulating
board-level designs. Creating models of operational amplifiers such as an LM741 or timer
ICs such as an LM555 is greatly simplified through the use of XSPICE code models. Another
example of code model use is shown in the next example where a complete sampled-data system
is simulated using XSPICE analog, digital, and User-Defined Node types simultaneously.

The circuit shown in Fig. 23.1 is designed to demonstrate several of the more advanced features
of XSPICE. In this example, you will be introduced to the process of creating code models and
linking them into ngspice. You will also learn how to print and plot the results of event-driven
analysis data. The ngspice/XSPICE circuit description for this example is shown below.

                         Figure 23.1: Example Circuit C3

Example:

      Mixed IO types
      * This circuit contains a mixture of IO types, including
      * analog, digital, user-defined (real), and ’null’.
      *
      * The circuit demonstrates the use of the digital and
      * user-defined node capability to model system-level designs
      * such as sampled-data filters. The simulated circuit
      * contains a digital oscillator enabled after 100us. The
      * square wave oscillator output is divided by 8 with a
      * ripple counter. The result is passed through a digital
      * filter to convert it to a sine wave.
      *
      .tran 1e-5 1e-3
      *
      v1 1 0 0.0 pulse(0 1 1e-4 1e-6)
      r1 1 0 1k
      *
      abridge1 [1] [enable] atod
      .model atod adc_bridge
      *
      aclk [enable clk] clk nand
      .model nand d_nand (rise_delay=1e-5 fall_delay=1e-5)
      *
      adiv2 div2_out clk NULL NULL NULL div2_out dff
      adiv4 div4_out div2_out NULL NULL NULL div4_out dff
      adiv8 div8_out div4_out NULL NULL NULL div8_out dff
      .model dff d_dff

Example (continued):

     abridge2 div8_out enable filt_in node_bridge2
     .model node_bridge2 d_to_real (zero=-1 one=1)
     *
     xfilter filt_in clk filt_out dig_filter
     *
     abridge3 filt_out a_out node_bridge3
     .model node_bridge3 real_to_v
     *
     rlpf1 a_out oa_minus 10k
     *
     xlpf 0 oa_minus lpf_out opamp
     *
     rlpf2 oa_minus lpf_out 10k
     clpf lpf_out oa_minus 0.01uF
     ***************************************
     .subckt dig_filter filt_in clk filt_out
     .model n0 real_gain (gain=1.0)
     .model n1 real_gain (gain=2.0)
     .model n2 real_gain (gain=1.0)
     .model g1 real_gain (gain=0.125)
     .model zm1 real_delay
     .model d0a real_gain (gain=-0.75)
     .model d1a real_gain (gain=0.5625)
     .model d0b real_gain (gain=-0.3438)
     .model d1b real_gain (gain=1.0)
     *
     an0a filt_in x0a n0
     an1a filt_in x1a n1
     an2a filt_in x2a n2
     *
     az0a x0a clk x1a zm1
     az1a x1a clk x2a zm1
     *
     ad0a x2a x0a d0a
     ad1a x2a x1a d1a
     *
     az2a x2a filt1_out g1
     az3a filt1_out clk filt2_in zm1
     *
     an0b filt2_in x0b n0
     an1b filt2_in x1b n1
     an2b filt2_in x2b n2
     *
     az0b x0b clk x1b zm1
     az1b x1b clk x2b zm1
     *
     ad0 x2b x0b d0b
     ad1 x2b x1b d1b
     *
     az2b x2b clk filt_out zm1
     .ends dig_filter

Example (continued):

      .subckt opamp plus minus out
      *
      r1 plus minus 300k
      a1 %vd (plus minus) outint lim
      .model lim limit (out_lower_limit = -12 out_upper_limit = 12
      + fraction = true limit_range = 0.2 gain=300e3)
      r3 outint out 50.0
      r2 out 0 1e12
      *
      .ends opamp
      *
      .end

This circuit is a high-level design of a sampled-data filter. An analog step waveform (created
from a ngspice pulse waveform) is introduced as ‘v1’ and converted to digital by code model
instance ‘abridge’. This digital data is used to enable a Nand-Gate oscillator (‘aclk’) after a
short delay. The Nand-Gate oscillator generates a square-wave clock signal with a period of
approximately two times the gate delay, which is specified as 1e-5 seconds. This 50 kHz clock
is divided by a series of D Flip Flops (‘adiv2’, ‘adiv4’, ‘adiv8’) to produce a square-wave at
approximately 6.25 kHz. Note particularly the use of the reserved word ‘NULL’ for certain
nodes on the D Flip Flops. This tells the code model that there is no node connected to these
ports of the flip flop.
The divide-by-8 and enable waveforms are converted by the instance ‘abridge2’ to the format
required by the User-Defined Node type ‘real’, which expected real-valued data. The output of
this instance on node filt_in is a real valued square wave that oscillates between values of -1
and 1. Note that the associated code model d_to_real is not part of the original XSPICE code
model library but has been added later to ngspice.
This signal is then passed through subcircuit ‘xfilter’ that contains a digital low-pass filter
clocked by node ‘clk’. The result of passing this square-wave through the digital low-pass
filter is the production of a sampled sine wave (the filter passes only the fundamental of the
square-wave input) on node filt_out. This signal is then converted back to ngspice analog
data on node a_out by node bridge instance ‘abridge3’.
The resulting analog waveform is then passed through an op-amp-based low-pass analog filter
constructed around subcircuit ‘xlpf’ to produce the final output at analog node ‘lpf_out’.

### 23.2.2 Running example C3

Now copy the file xspice_c3.cir from directory /examples/xspice/ into the current directory:

      $ cp /examples/xspice/xspice_c3.cir xspice_c3.cir

and invoke the new simulator executable as you did in the previous examples.

      $ ngspice xspice_c3.cir

Execute the simulation with the run command.

      ngspice 1 -> run

After a short time, the ngspice prompt should return. Results of this simulation are examined
in the manner illustrated in the previous two examples. You can use the plot command to plot
either analog nodes, event-driven nodes, or both. For example, you can plot the values of the
sampled-data filter input node and the analog low-pass filter output node as follows:

      ngspice 2 -> plot filt_in lpf_out

The plot shown in Fig. 23.2 should appear.

                          Figure 23.2: Plot of Filter Input and Output

You can also plot data from nodes inside a subcircuit. For example, to plot the data on node
‘x1a’ in subcircuit ‘xfilter’, create a pathname to this node with a dot separator.

      ngspice 3 -> plot xfilter.x1a

The output from this command is shown in Fig. 23.3. Note that the waveform contains vertical
segments. These segments are caused by the non-zero delays in the ‘real gain’ models used
within the subcircuit. Each vertical segment is actually a step with a width equal to the model
delay (1e-9 seconds).
Plotting nodes internal to subcircuits works for both analog and event-driven nodes.
To examine data such as the closely spaced events inside the subcircuit at node ‘xfilter.x1a’, it
is often convenient to use the eprint command to produce a tabular listing of events. Try this
by entering the following command:

                        Figure 23.3: Plot of Subcircuit Internal Node

      ngspice 4 -> eprint xfilter.x1a
      **** Results Data ****
      Time or Step
      xfilter.x1a
      0.000000000e+000 0.000000e+000 1.010030000e-004 2.000000e+000
      1.010040000e-004 2.562500e+000 1.210020000e-004 2.812500e+000
      1.210030000e-004 4.253906e+000 1.410020000e-004 2.332031e+000
      1.410030000e-004 3.283447e+000 1.610020000e-004 2.014893e+000
      1.610030000e-004 1.469009e+000 1.810020000e-004 2.196854e+000
      1.810030000e-004 1.176232e+000
      ...
      9.610030000e-004 3.006294e-001 9.810020000e-004 2.304755e+000
      9.810030000e-004 9.506230e-001 9.810090000e-004 -3.049377e+000
      9.810100000e-004 -4.174377e+000
      **** Messages ****
      **** Statistics ****
      Operating point analog/event alternations: 1
      Operating point load calls: 37
      Operating point event passes: 2
      Transient analysis load calls: 4299
      Transient analysis timestep backups: 87

This command produces a tabular listing of event-times in the first column and node values in
the second column. The 1 ns delays can be clearly seen in the fifth decimal place of the event
times.
Note that the eprint command also gives statistics from the event-driven algorithm portion of
XSPICE. For this example, the simulator alternated between the analog solution algorithm and
the event-driven algorithm one time while performing the initial DC operating point solution

prior to the start of the transient analysis. During this operating point analysis, 37 total calls were
made to event-driven code model functions, and two separate event passes or iterations were
required before the event nodes obtained stable values. Once the transient analysis commenced,
there were 4299 total calls to event-driven code model functions. Lastly, the analog simulation
algorithm performed 87 time-step backups that forced the event-driven simulator to backup its
state data and its event queues.
A similar output is obtained when printing the values of digital nodes. For example, print the
values of the node ‘div8 out’ as follows:

      ngspice 5 -> eprint div8_out
      **** Results Data ****
      Time or Step
      div8_out
      0.000000000e+000 1s
      1.810070000e-004 0s
      2.610070000e-004 1s
      ...
      9.010070000e-004 1s
      9.810070000e-004 0s
      **** Messages ****
      **** Statistics ****
      Operating point analog/event alternations: 1
      Operating point load calls: 37
      Operating point event passes: 2
      Transient analysis load calls: 4299
      Transient analysis timestep backups: 87

From this printout, we see that digital node values are composed of a two character string. The
first character (0, 1, or U) gives the state of the node (logic zero, logic one, or unknown logic
state). The second character (s, r, z, u) gives the ‘strength’ of the logic state (strong, resistive,
hi-impedance, or undetermined).
If you wish, examine other nodes in this circuit with either the plot or eprint commands.
When you are done, enter the quit command to exit the simulator and return to the operating
system prompt:

      ngspice 6 -> quit

So long.
