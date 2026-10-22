# 10 Digital Device Models

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 10.1 U devices (basic digital building blocks)

If PS compatibility mode is set, ngspice supports .subckt statements which contain entirely
U* instances of digital gates, flip-flops, latches, LOGICEXP and PINDLY behavioral primitives
(see chapter 10.1.2 for the list), and timing models. Typical rise/fall delays are estimated
from the timing models and PINDLY statements. CONSTRAINT primitives and io models
are ignored. Other U* instances (such as RAM, ROM, STIM and PLAs) in a .subckt are not
supported, and such .subckt will not be converted to XSPICE digital primitives.

These U devices are not meant to immediately describe digital circuits like the 74xx or 40xx
series. However they are used in subcircuits to generate models for such circuits (see chapter
10.2). Their syntax is mostly compatible to the Micro-Cap and PSPICE simulators.

### 10.1.1 General format

General form:

      U<name> <basic type> [(<parameter value>*)]
      +<digital power node> <digital ground node> <node>*
      +<timing model name> <I/O model name>
      +[MNTYMXDLY=<delay select value>]
      +[IO_LEVEL=<interface subcircuit select value>]

Example:

      U2 AND(2) $G_DPWR $G_DGND 4 5 6
      + M2 IOM2 IO_LEVEL=0 MNTYMXDLY=2

      .MODEL M2 UGATE ()
      .MODEL IOM2 UIO (INLD=0 OUTLD=0 DRVH=50 DRVL=50
      + ATOD1="ATOD1" DTOA1="DTOD1" ATOD2="ATOD2" DTOA2="DTOD2"
      + ATOD3="ATOD3" DTOA3="DTOD3" ATOD4="ATOD4" DTOA4="DTOD4"
      + TSWLH1=0 TSWLH2=0 TSWLH3=0 TSWLH4=0
      + TSWHL1=0 TSWHL2=0 TSWHL3=0 TSWHL4=0 DIGPOWER="DIGPOWER")

### 10.1.2 List of devices available in ngspice (basic types)

      Standard gates:
      BUF        buffer
      INV        inverter
      AND        AND gate
      NAND       NAND gate
      OR         OR gate
      NOR        NOR gate
      XOR        exclusive OR gate
      NXOR       exclusive NOR gate
      BUFA       buffer array
      INVA       inverter array
      ANDA       AND gate array
      NANDA      NAND gate array
      ORA        OR gate array
      NORA       NOR gate array
      XORA       exclusive OR gate array
      NXORA      exclusive NOR gate array
      AO         AND-OR compound gate
      OA         OR-AND compound gate
      AOI        AND-NOR compound gate
      OAI        OR-NAND compound gate
      Tristate gates:
      BUF3       buffer

      INV3       inverter
      AND3       AND gate
      NAND3      NAND gate
      OR3        OR gate
      NOR3       NOR gate
      XOR3       exclusive OR gate
      NXOR3      exclusive NOR gate
      BUF3A      buffer array
      INV3A      inverter array
      AND3A      AND gate array
      NAND3A     NAND gate array
      OR3A       OR gate array
      NOR3A      NOR gate array
      XOR3A      exclusive OR gate array
      NXOR3A     exclusive NOR gate array
      Flip-flops and latches:
      DFF        D-type flip-flop, positive-edge triggered
      JKFF       J-K flip-flop, negative-edge triggered
      DLTCH      D-type latch
      SRFF       S-R flip-flop
      Delay lines:
      DLYLINE    Delay line
      Behavioral primitives:
      LOGICEXP   Combinational logic expressions
      PINDLY     Output buffers and tristate buffers with estimated delays

### 10.1.3 URC transmission line versus U devices

For the first time ngspice may have a naming conflict, in that the reference designator U is used
for two different devices, the Uniformly distributet RC line and the U devices, our digital basic
types or primitives.

U-devices require the compatibility mode flag (12.11.1) set to PS. In addition U devices are
          recognized only when they occur inside of a subcircuit. Finally the basic type
          (second token in the U instance line) has to fit to the list of basic types given in the
          table above.

URC         in any other case ngspice will assume an URC (uniformly distributed) transmission
            line.

## 10.2 Support for standard digital devices

The digital primitives (U devices) are the basic building blocks of the models for digital ICs
used in ngspice. An example of a simple subcircuit model for a And Gate is listed below:

Example: 74LV08A Quad 2-Input And Gate

      * ------------------------- 74LV08A ------
      * Quad 2-Input And Gate
      *
      * TI PDF File
      * bss     2/21/03
      *
      .SUBCKT 74LV08A 1A 1B 1Y
      +     optional: DPWR_3V=$G_DPWR_3V DGND_3V=$G_DGND_3V
      +     params: MNTYMXDLY=0 IO_LEVEL=0

      U1 and(2) DPWR_3V DGND_3V
      +     1A 1B 1Y
      +     DLY_LV08 IO_LV-A MNTYMXDLY={MNTYMXDLY} IO_LEVEL={IO_LEVEL}

      .model DLY_LV08 ugate
      + (tplhTY=7.5ns tplhMX=12.3ns tphlTY=7.5ns tphlMX=12.3ns)

      .ENDS     74LV08A

The circuit example ex4.cir in ngspice/examples/digital/digital_devices, together with the
stimulus file ex4.stim presents a fully digital, event based full-adder simulation with 74xx
series ICs. The internal plotting capability of ngspice is used. ex5.cir with the stimulus file
ex5.stim demonstrates the conversion of a D-Type Flip-Flop. ex283.cir is a 74283 4-bit full
adder, with stimulus and involving GTKWave for plotting. Also, there are several new examples
illustrating LOGICEXP and PINDLY.
A set of such models for the 74xx devices currently supported by ngspice is available from the
ngspice models as 74xx-models.7z, derived from the Micro-Cap library.

## 10.3 Digital devices defined by a Hardware Description Lan-

          guage

Ngspice can make a digital device from a description in a Hardware Description Language,
such as Verilog or VHDL. There are several ways that can be done, including running the HDL
code in a separate process, or compiling directly to a partial netlist. The current Ngspice source
code and binary packages also have support for three more direct methods: HDL files may be
compiled by either Verilator, Icarus Verilog or GHDL and the output file may be loaded into
an instance of the d_cosim XSPICE code model (8.4.25). (Warning: using multiple d_cosim
instances in a circuit requires careful planning.)
The steps for using such a digital device are these: write HDL code whose top-level module
defines the device behaviour; the HDL file is compiled into a form acceptable by d_cosim; and
the netlist contains device and model lines to include the new device in a circuit. A circuit of this
type can only be used for a single simulation before process exit, as previous HDL simulation
state may not be cleared, even by remcirc.
10.3. DIGITAL DEVICES DEFINED BY A HARDWARE DESCRIPTION LANGUAGE315

Another method is to wrap the analog simulation in a dummy HDL module, implemented by
Ngspice’s shared library, and allow the HDL simulator to control the combined simulation. That
method is used here and, with additional testbench support, here.

### 10.3.1 Using Verilator, Verilog, and code model d_cosim

When using Verilator, version 4.210 or later is required. The compilation step is not straightforward,
as “glue code” must be added to the C++ software created by Verilator’s compiler so
that it can be attached to a d_cosim instance. A script is provided to make this step easier:

      ngspice vlnggen source.v

Ngspice is used to run the script vlnggen, passing the Verilog source file, source.v, as input. The
script analyses C++ code output from Verilator and creates additional code to describe the ports
of the top-level module. Then all the generated code is compiled. The output will be a shared
library/DLL called source.so/source.DLL that may be used in the netlist as:

      ahdldevice [ inputs ... ] [ outputs ... ]dmod
      .model dmod d_cosim simulation="some/path/source"

Formally, a third list of nodes may be included in the device instance line. If present, they are
matched against inout ports of the top-level Verilog module. But Verilator does not fully support
inout ports.
Additional arguments to vlnggen may be other HDL source files or options: everything is passed
to Verilator. To pass options to Verilator, insert “--” before them to mark the end of ngspice
options. Verilator’s “--timing” option must be passed this way if delays are used in the Verilog
source, so to use time delays in the Verilog source the command may be:

      ngspice vlnggen -- --timing pwm.v

The output file is named from the first Verilog source file (*.v) that is listed, or is “verilated.so”/”verilated.DLL”.
For each port type the connected event nodes are assigned to bits of the Verilog ports from left
to right, treating ports with multiple bits as big-endian: more significant bits are matched first.
If the number of bits of each port type do not match, a warning is issued and extra input or
output bits will be matched with any excess inout bits, in either direction.
Example netlist and Verilog code can be found at examples/xspice/verilator, with instructions
in README.txt.

### 10.3.2 Using Icarus Verilog, and code model d_cosim

Icarus Verilog handles a larger subset of the full SystemVerilog specification than Verilator and
compiles primarily into interpereted code. Ngspice includes components to run the interpreter,
VVP, inside an instance of the d_cosim code model. To use this feature, Verilog code is compiled
as usual for Icarus Verilog:

      iverilog -o adc adc.v

The output file is in a form that can be executed directly on Unix-like systems or by VVP.EXE
on Windows. It may also be included in a co-simulation with Ngspice by including netlist lines
like:

      aivldevice [ inputs ... ] [ outputs ... ][ inouts ... ]dmod
      .model dmod d_cosim simulation="ivlng" sim_args=["adc"]

Here, ports of the top-level Verilog module are matched to ngspice nodes as for Verilator. Additional
string values for the sim_args parameter will be passed to the Verilog simulation as
though included in a command line.
The timescale should always be set in Verilog source, even if no delays are used. The reason
is that even without delays, VVP seems to schedule output to the next internal clock tick, and
SPICE and Verilog times are bound as tight as possible. The precision should be small compared
to the expected transient simulation step.
While the user’s setup for co-simulation with Icarus Verilog should be simple, the underlying
mechanism is somewhat elaborate. In addition to the d_cosim code model that is included in
ngspice’s digital.cm dynamic library, three more dynamic libraries are loaded: ivlng.so/.DLL
is specified by d_cosim’s “simulation” parameter; it loads libvvp.so/.DLL, the dynamic library
version of Icarus Verilog’s simulation engine; and that in turn loads ivlng.vpi, a Verilog VPI
module. Additionally, libvvp loads the compiled Verilog code, here the file “adc”. The files
for ivlng.so/.DLL and ivlng.vpi are built and installed with ngspice. For libvvp to be available,
Icarus Verilog must be configured with “–enable-libvvp” before building.
NOTE: At the time of writing, libvvp is not included in standard binary builds, and Icarus
Verilog may need to be built from source. Version 13 or later should be used. Suitable binary
builds may be found at https://github.com/gatk555/ngspice-builds/actions (login required).
In case of problems, relative or absolute paths to all components can be set as parameters. The
lib_args parameter of d_cosim can be used to set: path to libvvp.so/.DLL; path to ivlng.vpi; and
the path to a VVP log file. Note that null strings are ignored, so if libvvp is on the standard
dynamic library search path (as it should be), it may be specified as “libvvp”, but must be set.
Example netlists can be found at examples/xspice/icarus_verilog, with instructions in README.txt.
The Verilog code is shared with the Verilator examples.
10.3. DIGITAL DEVICES DEFINED BY A HARDWARE DESCRIPTION LANGUAGE317

### 10.3.3 Using GHDL and code model d_cosim.

The open source compiler GHDL translates VHDL source into binary programs or shared libraries.
For use with d_cosim a shared library is generated, using the LLVM back end. (Other
GHDL back-ends may work, but have not been tested). To use this method, both an LLVM-
based build of GHDL and the C compiler, Clang, should be installed. GHDL Version 6, or later,
is required. Suitable GHDL binaries can be found on GHDL’s development site. (A Github
login is required for downloading.)
To prepare VHDL source for co-simulation, it must be processed by “ghdl -a” (analysis) and
combined with compiled source from ghdl_shim.c, a file included with ngspice. Then the code
must be “elaborated” by “ghdl -e” to produce a module that d_cosim can load. In addition,
an auxiliary module must be built from included source, using “ghdl --vpi-compile” and
“ghdl --vpi-link”. A script is provided to simplify these steps. If the top-level VHDL entity
has the same name as the first source file:

      ngspice ghnggen name.vhd ...

When entity and file names differ:

      ngspice -- ghnggen -top top_entity_name file_name.vhd ...

The result will be a dynamic library (.so, .DLL or .dylib) named after the top-level. Apart from
“-top”, anything else in the command will be passed to ghdl. In the netlist the VHDL code is
accessed as an A-device, with ports mapped as for Verilog:

      adut [ inputs ... ] [ outputs ... ][ inouts ... ]ghdl_mod
      .model ghdl_mod d_cosim
      +simulation="./entity" sim_args=["./entity"]

The sim_args values are passed to the simulation and may include “-gVariable=value” options
to override top-level Generic parameters. A lib_args parameter may be used to set the explicit
path to the auxiliary VP module, ghdlng.vpi. Otherwise it is expected to have been generated
in the current directory.
Example netlists can be found at examples/xspice/ghdl, with instructions in README.txt.

### 10.3.4 Using independent processes (e.g. C coded), pipes, and code model

          d_process
Independent processes, e.g. made of C-coded executables, may be integrated into ngspice by
using the code model d_process. A template for using this interface, with C-coded executables
and ngspice netlists, is available at examples/xspice/d_process. The README will give you a
detailed description of the procedure. A relatively complex example, a motor control, has been
provided by Uros Platise at Isotel. His d_process code model has been enhanced to serve also
MS Windows and is included in ngspice since version 42.

### 10.3.5 Using Yosys to map digital Verilog onto basic code model cells

Another method to bring HDL code into a ngspice netlists for mixed-signal simulation is to
use Yosys to compile HDL and map the generated synthesizable cells directly to a ngspice subcircuit
definition using basic XSPICE elements (BUF, NOT, NAND, NOR, DLATCH, DFF). A
demonstrator has been developed by Uros Platise at Isotel (see description and code).
