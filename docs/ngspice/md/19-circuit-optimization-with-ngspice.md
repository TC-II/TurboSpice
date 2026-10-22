# 19 Circuit optimization with ngspice

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 19.1 Optimization of a circuit

Your circuit design (analog, maybe mixed-signal) has already the best circuit topology. There
might be still some room for parameter selection, e.g. the geometries of transistors or values of
passive elements, to best fit the specific purpose. This is, what (automatic) circuit optimization
will deliver. In addition you may fine-tune, optimize and verify the circuit over voltage, process
or temperature corners. So circuit optimization is a valuable tool in the hands of an experienced
designer. It will relieve you from the routine task of ’endless’ repetitions of re-simulating your
design.

You have to choose circuit variables as parameters to be varied during optimization (e.g. device
size, component values, bias inputs etc.). Then you may pose performance constraints onto
you circuits (e.g. Vnode < 1.2V, gain > 50 etc.). Optimization objectives are the variables to be
minimized or maximized. The n objectives and m constraints are assembled into a cost function.

The optimization flow is now the following: The circuit is loaded. Several (perhaps only one)
simulations are started with a suitable starter set of variables. Measurements are done on the
simulator output to check for the performance constraints and optimization objectives. These
data are fed into the optimizer to evaluate the cost function. A sophisticated algorithm now
determines a new set of circuit variables for the next simulator run(s). Stop conditions have to
be defined by the user to tell the simulator when to finish (e.g. fall below a cost function value,
parameter changes fall below a certain threshold, number of iterations exceeded).

The optimizer algorithms, its parameters and the starting point influence the convergence behavior.
The algorithms have to provide measures to reaching the global optimum, not to stick
to a local one, and thus are tantamount for the quality of the optimizer.

ngspice does not have an integral optimization processor. Thus this chapter will rely on work
done by third parties to introduce ngspice optimization capability. ngspice provides the simulation
engine, a script or program controls the simulator and provides the optimizer functionality.

Four optimizers are presented here, using ngspice scripting language, using tclspice, using a
Python script, and using ASCO, a c-coded optimization program.

## 19.2 ngspice optimizer using ngspice scripts

Friedrich Schmidt (see his web site) has intensively used circuit optimization during his development
of Nonlinear loadflow computation with Spice based simulators. He has provided an
optimizer using the internal ngspice scripting language (see Chapt. 13.8). His original scripts
are found here. A slightly modified and concentrated set of his scripts is available from the
ngspice optimizer directory.
The simple example given in the scripts is OK with current ngspice. Real circuits have still to
be tested.

## 19.3 ngspice optimizer using tclspice

ngspice offers another scripting capability, namely the tcl/tk based tclspice option (see Chapt.
16). An optimization procedure may be written using a tcl script. An example is provided in
Chapt. 16.5.2.

## 19.4 ngspice optimizer using a Python script

Werner Hoch has developed a ngspice optimization procedure based on the ’differential evolution’
algorithm [21]. On his web page he provides a Python script containing the control flow
and algorithms.

## 19.5 ngspice optimizer using ASCO

The ASCO optimizer, developed by Joao Ramos, also applies the ’differential evolution’ algorithm
[21]. An enhanced version 0.4.7.1, adding ngspice as a simulation engine, may be
downloaded here (7z archive format). Included are executable files (asco, asco-mpi, ngspice-c
for MS Windows). The source code should also compile and function under Linux (not yet
tested).
ASCO is a standalone executable, which communicates with ngspice via ngspice input and output
files. Several optimization examples, originally provided by J. Ramos for other simulators,
are prepared for use with ngspice. Parallel processing on a multi-core computer has been tested
using MPI (MPICH2) under MS Windows. A processor network will be supported as well.
A MS Windows console application ngspice_c.exe is included in the archive. Several stand
alone tools are provided, but not tested yet.
Setting up an optimization project with ASCO requires advanced know-how of using ngspice.
There are several sources of information. First of all the examples provided with the distribution
give hints how to start with ASCO. The original ASCO manual is provided as well, or is
available here. It elaborates on the examples, using a commercial simulator, and provides a
detailed description how to set up ASCO. Installation of ASCO and MPI (under Windows) is
described in a file INSTALL.

Some remarks on how to set up ASCO for ngspice are given in the following sections (more
to be added). These a meant not as a complete description, but are an addition the the ASCO
manual.

### 19.5.1 Three stage operational amplifier

This example is taken from Chapt. 6.2.2 ‘Tutorial #2’ from the ASCO manual. The directory
examples /ngspice/amp3 contains four files:

amp3.cfg This file contains all configuration data for this optimization. Of special interest is
the following section, which sets the required measurements and the constraints on the measured
parameters:

      # Measurements #
      ac_power:VDD:MIN:0
      dc_gain:VOUT:GE:122
      unity_gain_frequency:VOUT:GE:3.15E6
      phase_margin:VOUT:GE:51.8
      phase_margin:VOUT:LE:70
      amp3_slew_rate:VOUT:GE:0.777E6
      #

Each of these entries is linked to a file in the /extract subdirectory, having exactly the same
names as given here, e.g. ac_power, dc_gain, unity_gain, phase_margin, and amp3_slew_rate.
Each of these files contains an # Info # section, which is currently not used. The # Commands
# section may contain a measurement command (including ASCO parameter #SYMBOL#, see
file /extract/unity_gain_frequency). It also may contain a .control section (see file /extract/phase_margin_min).
During set-up #SYMBOL# is replaced by the file name, a leading ‘z’,
and a trailing number according to the above sequence, starting with 0.

amp3.sp This is the basic circuit description. Entries like #LM2# are ASCO-specific, defined
in the # Parameters # section of file amp3.cfg. ASCO will replace these parameter placeholders
with real values for simulation, determined by the optimization algorithm. The .control
... .endc section is specific to ngspice. Entries to this section may deliver workarounds of
some commands not available in ngspice, but used in other simulators. You may also define
additional measurements, get access to variables and vectors, or define some data manipulation.
In this example the .control section contains an op measurement, required later for slew rate
calculation, as well as the ac simulation, which has to occur before any further data evaluation.
Data from the op simulation are stored in a plot op1. Its name is saved in variable dt. The ac
measurements sets another plot ac1. To retrieve op data from the former plot, you have to use
the {$dt}.<vector> notation (see file /extract/amp3_slew_rate).

n.typ, p.typ MOSFET parameter files, to be included by amp3.sp.

Testing the set-up

Copy asco-test.exe and ngspice_c.exe (console executable of ngspice) into the directory, and
run
$ asco-test -ngspice amp3

from the console window. Several files will be created during checking. If you look at <computername>.sp:
this is the input file for ngspice_c, generated by ASCO. You will find the additional
.measure commands and .control sections. The quit command will be added automatically
just before the .endc command in its own .control section. asco-test will display
error messages on the console, if the simulation or communication with ASCO is not ok.
The output file <computer-name>.out, generated by ngspice during each simulation, contains
symbols like zac_power0, zdc_gain1, zunity_gain_frequency2, zphase_margin3,
zphase_margin4, and zamp3_slew_rate5. These are used to communicate the ngspice output
data to ASCO. ASCO is searching for something like zdc_gain1 =, and then takes the next
token as the input value. Calling phase_margin twice in amp3.cfg has lead to two measurements
in two .control sections with different symbols (zphase_margin3, zphase_margin4).
A failing test may result in an error message from ASCO. Sometimes, however, ASCO freezes
after some output statements. This may happen if ngspice issues an error message that cannot
be handled by ASCO. Here it may help calling ngspice directly with the input file generated by
ASCO:
$ ngspice_c <computer-name>.sp

Thus you may evaluate the ngspice messages directly.

Running the simulation

Copy (w)asco.exe, (w)asco-mpi.exe and ngspice_c.exe (console executable of ngspice)
into the directory, and run
$ asco -ngspice amp3

or alternatively (if MPICH is installed)
$ mpiexec -n 7 asco-mpi -ngspice amp3

The following graph 19.1 shows the acceleration of the optimization simulation on a multi-core
processor (i7 with 4 real or 8 virtual cores), 500 generations, if -n is varied. Speed is tripled, a
mere 15 min suffices to optimize 21 parameters of the amplifier.

### 19.5.2 Digital inverter

This example is taken from Chapt. 6.2.1 Tutorial #1 from the ASCO manual. In addition to the
features already mentioned above, it adds Monte-Carlo and corner simulations. The file inv.cfg
contains the following section:

      #Optimization Flow#
      Alter:yes         $ do we want to do corner analysis?
      MonteCarlo:yes    $ do we want to do MonteCarlo analysis?

                             Figure 19.1: Optimization speed

     AlterMC cost:3.00 $ point at which we want to start ALTER and/or
                       $ MONTECARLO
     ExecuteRF:no      $ Execute or no the RF module to add RF parasitics?
     SomethingElse:
     #

Monte Carlo is switched on. It uses the AGAUSS function (see Chapt. 18.2). Its parameters
are generated by ASCO from the data supplied by the inv.cfg section #Monte Carlo#. According
to the paper by Pelgrom on MOS transistor matching [22] the AGAUSS parameters are
calculated as                                                      
                                           ABeta        W      −6
                       W = AGAUSS W, √                ·    · 10 , 1                (19.1)
                                          2 ·W · L · m 100
                                                               
                                            AV T           −9
                      delvto = AGAUSS 0, √             · 10 , 1                     (19.2)
                                          2 ·W · L · m
The .ALTER command is not available in ngspice. However, a new option in ngspice to the
altermod command (13.5.4) enables the simulation of design corners. The #Alter# section in
inv.cfg gives details. Specific to ngspice, again several .control section are used.

     # ALTER #
     .control
     * gate oxide thickness varied
     altermod nm pm file [b3.min b3.typ b3.max]
     .endc
     .control
     * power supply variation
     alter vdd=[2.0 2.1 2.2]
     .endc
     .control

      run
      .endc
      #

NMOS (nm) and PMOS (pm) model parameter sets are loaded from three different model files,
each containing both NMOS and PMOS sets. b3.typ is assembled from the original parameter
files n.typ and p.typ, provided with original ASCO, with some adaptation to ngspice BSIM3.
The min and max sets are artificially created in that only the gate oxide thickness deviates ±1
nm from what is found in model file b3.typ. In addition the power supply voltage is varied,
so in total you will find 3 x 3 simulation combinations in the input file <computer-name>.sp
(after running asco-test).

### 19.5.3 Bandpass

This example is taken from Chapt. 6.2.4 Tutorial #4 from the ASCO manual. S11 in the
passband is to be maximised. S21 is used to extract side lobe parameters. The .net command
is not available in ngspice, so S11 and S21 are derived with a script in file bandpass.sp as
described in Chapt. 13.9. The measurements requested in bandpass.cfg as

      # Measurements #
      Left_Side_Lobe:---:LE:-20
      Pass_Band_Ripple:---:GE:-1
      Right_Side_Lobe:---:LE:-20
      S11_In_Band:---:MAX:---
      #

are realized as ’measure’ commands inside of control sections (see files in directory extract).
The result of a measure statement is a vector, which may be processed by commands in the
following lines. In file extract/S1_In_Band #Symbol# is made available only after a short
calculation (inversion of sign), using the print command. quit has been added to this entry
because it will become the final control section in <computer-name>.sp. A disadvantage of
measure inside of a .control section is that parameters from .param statements may not be
used (as is done in example 19.5.4).
The bandpass example includes the calculation of RF parasitic elements defined in rfmodule.cfg
(see Chapt. 7.5 of the ASCO manual). This calculation is invoked by setting

      ExecuteRF:yes          $Execute or no the RF module to add RF parasitics?

in bandpass.cfg. The two subcircuits LBOND_sub and CSMD_sub are generated in <computername>.sp
to simulate these effects.

### 19.5.4 Class-E power amplifier

This example is taken from Chapt. 6.2.3 Tutorial #3 from the ASCO manual. In this example
the ASCO post processing is applied in file extract/P_OUT (see Chapt. 7.4 of the ASCO
manual.). In this example .measure statements are used. They allow using parameters from
.param statements, because they will be located outside of .control sections, but do not allow
doing data post processing inside of ngspice. You may use ASCO post processing instead.
