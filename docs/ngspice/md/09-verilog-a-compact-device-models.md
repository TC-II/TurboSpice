# 9 Verilog-A Compact Device Models

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 9.1 Introduction

New compact device models today are released as Verilog-A code, a analog subset of Verilog-
AMS. Well-known examples are BSIMBULK, BSIMCMG, PSP, HiSIM or HICUM. The Si2
CMC web page lists more than 20 device models which are publicly available. The models
cover state-of-the-art MOS devices like SOI, FinFet, multi-gate and high voltage transistors,
high speed SiGe bipolar transistors, HEMTs as well as complex diodes and resistors. ngspice
makes all of these models available by its integrated OSDI interface and the OpenVAF compiler,
which translates Verilog-A device models into dynamically loadable libraries. User-defined
Verilog-A models may be compiled and loaded into ngspice as well. Currently Linux and MS
Windows are supported, OSDI/OpenVAF for macOS is not yet available. We are thankful to
SemiMod GmbH for these excellent contributions.

## 9.2 OSDI/OpenVAF

OSDI is a simulator independent interface for device models. Since release 39 ngspice contains
an integrated adapter to serve this interface and communicate with the compiled shared library
device models. The shared library models are linked into ngspice dynamically at runtime with
the osdi or pre_osdi (see 13.5.57) .control language commands.

OpenVAF compiles Verilog-A compact device model files into shared libraries that conform to
the OSDI interface. The model descriptions have to comply with the standard Verilog-AMS
LRM 2.x. Since ngspice-42, the small signal noise simulation (11.3.4) is implemented. Noise
simulation , however, is only available with the Sparse 1.3 matrix solver, not with KLU (see
11.1.1). Other restrictions may apply. Please consult the OpenVAF web pages for further
information. QA actions are not possible due to CMC refusing to provide data.

## 9.3 How to create and apply OpenVAF models

### 9.3.1 Preparing for simulation

Using Verilog-A models for simulation in ngspice consists of five steps: Obtain or compile
ngspice with OSDI interface, compile the VA-model with OpenVAF, prepare a suitable model
parameter set, load the compiled model into ngspice ... and start the simulation.

#### 9.3.1.1 Obtaining OpenVAF

OpenVAF may be downloaded for MS Windows or Linux as a single executable each from
https://openvaf.semimod.de/download/, and copied into a user defined directory. Compiling
OpenVAF yourself is possible, however is not recommended due to its complicated procedure.

#### 9.3.1.2 Verilog-A compact models

Verilog-A compact device models are available from the si2 CMC standard compact model
page or directly from device modelling web sites, e.g. BSIM from UC Berkeley, HiSIM from
Hiroshima University, PSP from CEA-Leti, or HICUM from TU Dresden. Others are available.
User provided or user defined models may be compiled as well. All models have to comply
to the LRM 2.x standard of Verilog-AMS. Not all publicly availables models do comply (e.g.
PSP102, EKV2.6).
There is a github repository VA-Models with most of the public available Verilog-A compact
models. The models are checked against the LRM 2.4.0 and prepared for ngspice simulation.
A script for generation of the osdi files is provided and each model has more or less simple
ngspice netlist files to show main capabilities. So this web site should be a good starting point
for beginners.

#### 9.3.1.3 Prepare ngspice

Compile ngspice with the configure flag -enable-osdi to add the OSDI interface to ngspice.
The MSVC Windows version ngspice.exe from the distribution already contains this interface.

#### 9.3.1.4 Compile the models

A very basic approach is to put the openvaf executable and the Verilog-A model (e.g. bsimbulk.va)
into a directory, then from a console window cd into that directory and call the command
openvaf bsimbulk.va. After a few seconds the compiled shared library bsimbulk.osdi
becomes available, ready to be loaded into ngspice.
Where to place *.osdi? Basically in any directory of your choice, the osdi or pre-osdi commands
(9.3.1.6) may be prepended by an absolute or relative path to that directory. For a permanent
location a bulk model install to libs/ngspice is recommended (to the folder where you
also find the XSPICE code model libs *.cm). An easy way that ngspice can find the compiled

and linked shared library files (*.osdi) is to use the environment variable NGSPICE_OSDI_DIR,
e.g. in Linux export NGSPICE_OSDI_DIR="$HOME/Verilog-A/VA-Models/osdilibs".
openvaf --help yields more options of the compiler.
To simplify making suitable *.osdi models for the example netlists provided in ngspice/examples/osdi,
the appropriate Verilog-A models and short scripts (for Linux and Windows) are
available for download as VAforOSDI.7z from our release directory. The following steps are
required to compile the shared library models:

    • Expand VAforOSDI.7z into a directory of your choice.

    • Download OpenVAF (Linux or Windows) from and place the executable here in this
      directory.

    • Run the script openvaf-compile-va.bat for MS Windows or openvaf-compile-va.sh
      for Linux

    • Copy the *.osdi files from directory osdilibs to the place where then code models
      (*.cm) are located, typically in lib/ngspice or similar.

    • Edit file ’spinit’, typically found in share/ngspice/scripts: Comment out the line
      ’unset osdi_enabled’

#### 9.3.1.5 Prepare the model parameters

According to chapter 2.5 the model parameter set for each device model is organized in a
.model line. This is valid for OSDI models as well. However here the model type takes
the role to distinguish models from each other, not the level or version parameters found in
the intrinsic models. A TYPE parameter determines, if NMOS (TYPE=1) or PMOS (TYPE=-1),
NPN (TYPE=1) or PNP (TYPE=-1) are selected.
Consider as an example the bsimbulk model. The modeltype is set by the

      module bsimbulk(d, g, s, b, t);

line of the BSIMBULK.va Verilog-A model file. So one has to search for the module name in
the *.va file to obtain the modeltype for the .model line and the number of nodes (and their
meanings) for the instance (or device) line while creating the netlist (see next chapter 9.3.1.6).
General form:

      .model mname modeltype(pname1=pval1 pname2=pval2 ... )

Examples:

      .model BSIMBULK_osdi_N bsimbulk TYPE=1 GEOMOD=0 RGEOMOD=0 ...

So to prepare the .model line, select an appropriate model parameter set, comment out the
version and level parameters, add the type parameter, and change the modeltype to the
Verilog-A module name.

#### 9.3.1.6 Prepare the ngspice netlist

The compiled model, e.g. bsimbulk.osdi, has to be loaded into ngspice. This may occur
automatically during start-up of ngspice, if the installation has been prepared according to the
bulk model install (compiled *.osdi models in lib/ngspice, osdi commands added to spinit).
Local usage of a *.osdi which are residing in an arbitrary directory is possible from within a
.control section (12.4.3) by the pre_osdi command. A relative path (as in the example below)
or an absolute path to that directory may be chosen.

        pre_osdi ../osdi_libs/bsimbulk107.osdi

The reference designator for the OSDI devices is the letter N. Instance lines starting with N are
recognized as OSDI devices. The model name mname has to point to the .model line which
contains the parameter set to be selected.
Instance line, general form:

        Ndevname node1 ... nodex mname pname1=pval1 pname2=pval2 ...

Examples:

        Np1 z a vdd vdd BSIMBULK_osdi_P l=0.1u w=1u
        + as=0.26235p ad=0.26235p ps=2.51u    pd=2.51u
                                _    _
        Nn1 z a vss vss BSIMBULK osdi N l=0.1u w=0.5u
        + as=0.131175p ad=0.131175p ps=1.52u  pd=1.52u

NMOS and PMOS devices are selected by their respective model names BSIMBULK_osdi_N
and BSIMBULK_osdi_P. The number and role of the nodes has been defined in the VA code
in its module statement (module bsimbulk(d, g, s, b, t); in the BSIMBULK example).
Instance parameters (like l, w, as etc.) are allowed, as defined by the VA code.

#### 9.3.1.7 Run the simulation

The simulation may be run as usual. Batch mode is especially supported when the OSDI libraries
are loaded via spinit during ngspice start-up.

### 9.3.2 OSDI/OpenVAF examples distributed with ngspice

Several example input netlists are available in folder ngspice/examples/osdi. All (except
for bsimbulk-local) make use of the *.osdi installation as a bulk model install in a folder
pointed to by spinit. bsimbulk-local however requires a local copy of bsimbulk.osdi into
folder bsimbulk-local/osdi_libs.
Example folders bsimbulk, bsimbulk-local, bsimcmg, mixed-models, and psp103 contain
MOS devices with their dc characteristics, CMOS inverters, CMOS ring oscillators, or even the
7552_ann benchmark CMOS circuit with 15.000 transistors and may more passives. Hicuml0,
or mextram contain bipolar devices with output characteristics, Gummel-plot and some circuits.
r2_cmc is a special resistor model.
