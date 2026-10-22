# 16 TCLspice

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Spice historically comes as a simulation engine with a Command Line Interface. The Spice
engine can also be used with a Graphical User Interface. Tclspice represents a third approach
to interfacing ngspice simulation functionality. Tclspice is nothing more than a new way of
compiling and using SPICE source code. Spice is no longer considered as a standalone program
but as a library invoked by a TCL interpreter. It either permits direct simulation in a TCL shell
(this is quite analogous to the command line interface of ngspice), or it permits the elaboration
of more complex, more specific, or more user friendly simulation programs, by writing TCL
scripts.

## 16.1 tclspice framework

The technical difference between the ngspice CLI interface and tclspice is that the CLI interface
is compiled as a standalone program, whereas tclspice is a shared object. Tclspice is designed to
work with tools that expand the capabilities of ngspice: TCL for the scripting and programming
language interface and BLT for data processing and display. This two tools give tclspice all of
its relevance, with the insurance that the functionality is maintained by competent people.
Making tclspice (see 16.6) produces two files: libspice.so and pkgIndex.tcl. libspice.so is the
executable binary that the TCL interpreter calls to handle SPICE commands. pkgIndex.tcl take
place in the TCL directory tree, providing the SPICE package1 to the TCL user.
BLT is a TCL package. It is quite well documented. It permits handling mathematical vector
data structures for calculus and display, in a Tk interpreter like wish.

## 16.2 tclspice documentation

A detailed documentation on tclspice commands is available on the original tclspice web page.

## 16.3 spicetoblt

Tclspice opens its doors to TCL and BLT with a single specific command spicetoblt.
  1 package has to be understood as the TCL package

TCLspice gets its identity in the command spice::vectoblt . This command copies data computed
by the simulation engine into a tcl variable. vectoblt is composed of three words: vec,
to and blt. Vec means SPICE vector data. To is the English preposition, and blt is a useful tcl
package providing a vector data structure. Example:

      blt::vector create Iex
      spice::vectoblt Vex#branch Iex

Here an empty blt vector is created. It is then filled with the vector representation of the current
flowing out of source Vex. Vex#branch is native SPICE syntax. Iex is the name of the BLT
vector.
The reverse operation is handled by native SPICE commands, such as alter, let and set.

## 16.4 Running TCLspice

TCLspice consists of a library or a package to include in your tcl console or script:

      load /somepath/libspice.so
      package require spice

Then you can execute any native SPICE command by preceding it with spice::. For example
if you want to source the testCapa.cir netlist, type the following:

      spice::source testCapa.cir
      spice::spicetoblt example...

Plotting data is not a matter of SPICE, but of tcl. Once the data is stored in a blt vector, it can
be plotted. Example:

      blt::graph .cimvd -title "Cim = f(Vd)"
      pack .cimvd
      .cimvd element create line1 -xdata Vcmd -ydata Cim

With blt::graph a plotting structure is allocated in memory. With pack it is placed into the
output window, and becomes visible. The last command, and not the least, plots the function
Cim = f (Vcmd ), where Cim and Vcmd are two BLT vectors.

## 16.5 examples

### 16.5.1 Active capacitor measurement

This is a crude implementation of a circuit described by Marc Kodrnja, in his PhD thesis that
was found on the Internet. The simulation outputs a graph representing virtual capacitance
versus a control voltage. The function C = f (V ) is calculated point by point. For each control

voltage value, the virtual capacitance is calculated in a frequency simulation. A control value
that should be as close to zero as possible is calculated to assess simulation success.

#### 16.5.1.1 Invocation:

This script can be invoked by typing wish testbench1.tcl

#### 16.5.1.2 testbench1.tcl

This line loads the simulator capabilities

      package require spice

This is a comment (Quite useful if you intend to live with other Human beings)

      # Test of virtual capacitor circuit
      # Vary the control voltage and log the resulting capacitance

A good example of the calling of a SPICE command: precede it with spice::

      spice::source "testCapa.cir"

This reminds that any regular TCL command is of course possible

      set n 30 set dv 0.2
      set vmax [expr $dv/2]
      set vmin [expr -1 * $dv/2]
      set pas [expr $dv/ $n]

BLT vector is the structure used to manipulate data. Instantiate the vectors

      blt::vector create Ctmp
      blt::vector create Cim
      blt::vector create check
      blt::vector create Vcmd

Data is, in my coding style, plotted into graph objects. Instantiate the graph

      blt::graph .cimvd -title "Cim = f(Vd)"
      blt::graph .checkvd -title "Rim = f(Vd)"
      blt::vector create Iex
      blt::vector create freq
      blt::graph .freqanal -title "Analyse frequentielle"
      #
      # First simulation: A simple AC plot
      #
      set v [expr {$vmin + $n * $pas / 4}]
      spice::alter vd = $v
      spice::op
      spice::ac dec 10 100 100k

Retrieve a the intensity of the current across Vex source

      spice::vectoblt {Vex#branch} Iex

Retrieve the frequency at which the current have been assessed

      spice::vectoblt {frequency} freq

Room the graph in the display window

      pack .freqanal

Plot the function Iex =f(V)

      .freqanal element create line1 -xdata freq -ydata Iex
      #
      # Second simulation: Capacitance versus voltage control
      # for {set i 0} {[expr $n - $i]} {incr i }
      #     { set v [expr {$vmin + $i * $pas}]
      spice::alter vd = $v
      spice::op spice::ac dec 10 100 100k

Image capacitance is calculated by SPICE, instead of TCL there is no objective reason

      spice::let Cim = real(mean(Vex#branch/(2*Pi*i*frequency*(V(5)-V(6)))))
      spice::vectoblt Cim Ctmp

Build function vector point by point

      Cim append $Ctmp(0:end)

Build a control vector to check simulation success

       spice::let err = real(mean(sqrt((Vex#branch-
               (2*Pi*i*frequency*Cim*V(5)-V(6)))^2)))
       spice::vectoblt err Ctmp check
       append $Ctmp(0:end)

Build abscissa vector

       FALTA ALGO... Vcmd append $v }

Plot

       pack .cimvd
       .cimvd element create line1 -xdata Vcmd -ydata Cim
       pack .checkvd
       .checkvd element create line1 -xdata Vcmd -ydata check

### 16.5.2 Optimization of a linearization circuit for a Thermistor

This example is both the first and the last optimization program written for an electronic circuit.
It is far from perfect.
The temperature response of a CTN is exponential. It is thus nonlinear. In a battery charger
application floating voltage varies linearly with temperature. A TL431 voltage reference sees
its output voltage controlled by two resistors (r10, r12) and a thermistor (r11). The simulation
is run at a given temperature. The thermistor is modeled in SPICE by a regular resistor. Its
resistivity is assessed by the TCL script. It is set with a spice::alter command before running
the simulation. This script uses an iterative optimization approach to try to converge to a set
of two resistor values that minimizes the error between the expected floating voltage and the
TL431 output.

#### 16.5.2.1 Invocation:

This script can be executed by the user by simply executing the file in a terminal.

       ./testbench3.tcl

Two issues2 are important to point out:
   2 For those who are really interested in optimizing circuits: Some parameters are very important for quick and

correct convergence. The optimizer walks step by step to a local minimum of the cost function you define. Starting
from an initial vector you provide, it converges step by step. Consider trying another start vector if the result is not
the one you expected.
   The optimizer will carry on walking until it reaches a vector whose resulting cost is smaller than the target cost
you provided. You must also provide a maximum iteration count in case the target can not be achieved. Balance
time, specifications, and every other parameter. For a balance between quick and accurate convergence adjust the
‘factor’ variable, at the beginning of minimumSteepestDescent in the file differentiate.tcl.

      • During optimization loop, graphical display of the current temperature response is not yet
        possible and I don’t know why. Each time a simulation is performed, some memory is
        allocated for it.

      • The simulation result remains in memory until the libspice library is unloaded (typically:
        when the tcl script ends) or when a spice::clean command is performed. In this kind of
        simulation, not cleaning the memory space will freeze your computer and you’ll have to
        restart it. Be aware of that.

#### 16.5.2.2 testbench3.tcl

This calls the shell sh who then runs wish with the file itself.

        #!/bin/sh
        # WishFix \
        exec wish "$0" ${1+"$@"}
        #
        #
        #

Regular package for simulation

        package require spice

Here the important line is source differentiate.tcl that contains the optimization library

        source differentiate.tcl

Generates a temperature vector

        proc temperatures_calc {temp_inf temp_sup points} {
        set tstep [ expr " ( $temp_sup - $temp_inf ) / $points " ]
        set t $temp_inf
        set temperatures ""
        for { set i 0 } { $i < $points } { incr i } {
            set t [ expr { $t + $tstep } ]
            set temperatures "$temperatures $t"
        }
        return $temperatures }

generates thermistor resistivity as a vector, typically run: thermistance_calc res B [ temperatures_calc
temp_inf temp_sup points ]

      proc thermistance_calc { res B points } {
      set tzero 273.15
      set tref 25
      set thermistance ""
      foreach t $points {
              set res_temp [expr " $res *
      +       exp ( $B * ( 1 / ($tzero + $t) -
      +       1 / ( $tzero + $tref ) ) ) " ]
              set thermistance "$thermistance $res_temp"
      }
      return $thermistance }

generates the expected floating value as a vector, typically run: tref_calc res B [ temperatures_calc
temp_inf temp_sup points ]

      proc tref_calc { points } {
      set tref ""
      foreach t $points {
          set tref "$tref[expr "6*(2.275-0.005*($t-20))-9"]"
      }
      return $tref }

In the optimization algorithm, this function computes the effective floating voltage at the given
temperature.

      ### NOTE:
      ### As component values are modified by a spice::alter
      ### Component values can be considered as global variable.
      ### R10 and R12 are not passed to iteration function
      ### because it is expected to be correct, i.e. to
      ### have been modified soon before
      proc iteration { t } { set tzero 273.15 spice::alter
         r11 = [ thermistance_calc 10000 3900 $t ]
      # Temperature simulation often crashes. Comment it out...
      #spice::set temp = [ expr " $tzero + $t " ]
      spice::op
      spice::vectoblt vref_temp tref_tmp
      ### NOTE:
      ### As the library is executed once for the
      ### whole script execution, it is important to manage the memory
      ### and regularly destroy unused data set. The data
      ### computed here will not be reused. Clean it
      spice::destroy all return [ tref_tmp range 0 0 ] }

This is the cost function optimization algorithm will try to minimize. It is a 2-norm (Euclidean
norm) of the error across the temperature range [-25:75]°C.

      proc cost { r10 r12 } {
      tref_blt length 0
      spice::alter r10 = $r10
      spice::alter r12 = $r12
      foreach point [ temperatures_blt range 0
      +       [ expr " [temperatures_blt length ] - 1" ] ] {
      +       tref_blt append [ iteration $point ]
      }
      set result [ blt::vector expr " 1000 *
              sum(( tref_blt - expected_blt )^2 )" ]
          _
      disp curve $r10 $r12
      return $result }

This function displays the expected and effective value of the voltage, as well as the r10 and r12
resistor values

      proc disp_curve { r10 r12 }
      + { .g configure -title "Valeurs optimales: R10 = $r10 R12 =
         $r12" }

Main loop starts here

      #
      # Optimization
      # blt::vector create tref_tmp
      blt::vector create tref_blt
      blt::vector create expected_blt
      blt::vector create temperatures_blt temperatures_blt
      append [ temperatures_calc -25 75 30 ] expected_blt
      append [ tref_calc [temperatures_blt range 0
      +      [ expr " [ temperatures_blt length ] - 1" ] ] ]
      blt::graph .g
      pack .g -side top -fill both -expand true
      .g element create real -pixels 4 -xdata temperatures_blt
      +       -ydata tref_blt
      .g element create expected -fill red -pixels 0 -dashes
      +       dot -xdata temperatures_blt -ydata expected_blt

Source the circuit and optimize it. The result is retrieved in the variable r10r12e and put into
r10 and r12 with a regular expression. A bit ugly.

      spice::source FB14.cir
      set r10r12 [ ::math::optimize::minimumSteepestDescent
      +            cost { 10000 10000 } 0.1 50 ]
      regexp {([0-9.]*) ([0-9.]*)} $r10r12 r10r12 r10 r12

Outputs optimization result

      #
      # Results
      # spice::alter r10 = $r10
      spice::alter r12 = $r12
      foreach point [ temperatures_blt range 0
      +   [ expr " [temperatures_blt length ] - 1" ] ] {
              tref_blt append [ iteration $point ]
      }
      disp_curve $r10 $r12

### 16.5.3 Progressive display

This example is quite simple but it is very interesting. It displays a transient simulation result
on the fly. You may now be familiar with most of the lines of this script. It uses the ability of
BLT objects to automatically update. When the vector data is modified, the strip-chart display
is modified accordingly.

#### 16.5.3.1 testbench2.tcl

      #!/bin/sh
      # WishFix \
        exec wish -f "$0" ${1+"$@"}
      ###
      package require BLT package require spice

this avoids to type blt:: before the blt class commands

      namespace import blt::*
      wm title . "Vector Test script"
      wm geometry . 800x600+40+40 pack propagate . false

A strip chart with labels but without data is created and displayed (packed)

      stripchart .chart
      pack .chart -side top -fill both -expand true
      .chart axis configure x -title "Time" spice::source example.cir
      spice::bg
      run after 1000 vector
      create a0 vector
      create b0 vectorry
      create a1 vector
      create b1 vector
      create stime
      proc bltupdate {} {
      puts [spice::spice_data]
      spice::spicetoblt a0 a0
      spice::spicetoblt b0 b0
      spice::spicetoblt a1 a1
      spice::spicetoblt b1 b1
      spice::spicetoblt time stime
      after 100 bltupdate }
      bltupdate .chart element create a0 -color red -xdata
      +       stime -ydata a0
      .chart element create b0 -color blue -xdata stime -ydata b0
      .chart element create a1 -color yellow -xdata stime -ydata a1
      .chart element create b1 -color black -xdata stime -ydata b1

## 16.6 Compiling

### 16.6.1 Linux

Get tcl8.4 from your distribution. You will need the blt plotting package (compatible to the old
tcl 8.4 only) from here. See also the actual blt wiki.

      ./configure --with-tcl ..
      make
      sudo make install

### 16.6.2 MS Windows

Can be done, but is tedious. Here it is described by a procedure on Windows 7, 64 Bit Home
Edition.

#### 16.6.2.1 Downloads

download tcl8.6b2-src.zip from http://www.tcl.tk/software/tcltk/download.html
download tk8.6b2-src.zip

download blt from http://ngspice.sourceforge.net/experimental/blt2.4z.7z
expand all to d:\software

#### 16.6.2.2 Tcl

double click on D:\software\tcl8.6b2\win\tcl.dsw
convert to MS Visual Studio 2008 project
select release or debug
create tcl as tcl86t.dll.

#### 16.6.2.3 Tk

edit D:\software\tk8.6b2\win\buildall.vc.bat
line 31 to
call C:\Program Files (x86)\Microsoft Visual Studio 9.0\VC\vcvarsall.bat
line 53 to
if "%TCLDIR%" == "" set TCLDIR=..\..\tcl8.6b2
open cmd window
cd to
d:\software\tk8.6b2\win>
then
d:\software\tk8.6b2\win> buildall.vc.bat debug
tk will be made as tk86t.dll, in addition wish86t.exe is generated.

#### 16.6.2.4 blt

blt source files have been downloaded from the blt web page and modified for compatibility
with TCL8.6. To facilitate making blt24.dll, the modified source code is available as a 7z
compressed file, including a project file for MS Visual Studio 2008.

#### 16.6.2.5 tclspice

ngspice is compiled and linked into a dll called spice.dll that may be loaded by wish86t.exe.
MS Visual Studio 2008 is the compiler applied. A project file may be downloaded as a 7z
compressed file. Expand this file in the ngspice main directory. The links to tcl and tk are hardcoded,
so both have to be installed in the places described above (d:\software\...). spice.dll
may be generated in Debug, Release or ReleaseOMP mode.

## 16.7 MS Windows 32 Bit binaries

You may download the compiled binaries, including tcl, tk, blt and tclspice, plus the examples,
slightly modified, from http://ngspice.sourceforge.net/experimental/tclspice-25.7z.
