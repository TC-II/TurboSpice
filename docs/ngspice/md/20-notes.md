# 20 Notes

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 20.1 Glossary

card A logical SPICE input line. A card may be extended through the use of the ‘+’ sign in
     SPICE, thereby allowing it to take up multiple lines in a SPICE deck.
code model A model of a device, function, component, etc. which is based solely on a C
     programming language-based function. In addition to the code models included with the
     XSPICE option of the ngspice simulator, you can use code models that you develop for
     circuit modeling.
deck A collection of SPICE cards that together specify all input information required in order
     to perform an analysis. A ‘deck’ of ‘cards’ will in fact be contained within a file on the
     host computer system.
element card A single, logical line in an ngspice circuit deck that describes a circuit element.
     Circuit elements are connected to each other to form circuits (e.g., a logical card that
     describes a resistor, such as R1 2 0 10K, is an element card).
instance A unique occurrence of a circuit element. See ‘element card’, in which the instance
      R1 is specified as a unique element (instance) in a hypothetical circuit description.

macro A macro, in the context of this document, refers to a C language macro that supports the
    construction of user-defined models by simplifying input/output and parameter-passing
    operations within the Model Definition File.
.mod Refers to the Model Definition File in XSPICE. The file suffix reflects the file-name of
     the model definition file: cfunc.mod.
.model Refers to a model card associated with an element card in ngspice. A model card allows
     for data defining an instance to be conveniently located in the ngspice deck such that the
     general layout of the elements is more readable.
Nutmeg The ngspice post-processor (now obsolete). This provides a simple stand-alone sim-
    ulator interface that can be used with the ngspice simulator to display and plot simulator
    raw files.
subcircuit A ‘device’ within an ngspice deck that is defined in terms of a group of element
      cards and that can be referenced in other parts of the ngspice deck through element cards.

## 20.2 Acronyms and Abbreviations

ATE Automatic Test Equipment

CAE Computer-Aided Engineering

CCCS Current Controlled Current Source.

CCVS Current Controlled Voltage Source.

FET Field Effect Transistor

IDD Interface Design Document

IFS Refers to the Interface Specification File. The abbreviation reflects the file name of the
     Interface Specification File: ifspec.ifs.

MNA Modified Nodal Analysis

MOSFET Metal Oxide Semiconductor Field Effect Transistor

PWL Piece-Wise Linear

RAM Random Access Memory

ROM Read Only Memory

SDD Software Design Document

SI Simulator Interface

SPICE Simulation Program with Integrated Circuit Emphasis. This program was developed at
    the University of California at Berkeley and is the origin of ngspice.

SPICE3 Version 3 of SPICE.

SRS Software Requirements Specification

SUM Software User’s Manual

UCB University of California at Berkeley

UDN User-Defined Node(s)

VCCS Voltage Controlled Current Source.

VCVS Voltage Controlled Voltage Source

XSPICE Extended SPICE; option to ngspice, integrating predefined or user defined code mod-
    els for event-driven mixed-signal simulation.

## 20.3 To Do

  1. Review of Chapt. 1.3

  2. hfet1,2 model descriptions

  3. MOS level 9 description
Bibliography

[1] A. Vladimirescu and S. Liu, ‘The Simulation of MOS Integrated Circuits Using SPICE2’
    ERL Memo No. ERL M80/7, Electronics Research Laboratory University of California,
    Berkeley, October 1980

[2] T. Sakurai and A. R. Newton, ‘A Simple MOSFET Model for Circuit Analysis and its ap-
    plication to CMOS gate delay analysis and series-connected MOSFET Structure’ ERL
    Memo No. ERL M90/19, Electronics Research Laboratory, University of California,
    Berkeley, March 1990

[3] B. J. Sheu, D. L. Scharfetter, and P. K. Ko, ‘SPICE2 Implementation of BSIM’ ERL Memo
    No. ERL M85/42, Electronics Research Laboratory University of California, Berkeley,
    May 1985

[4] J. R. Pierret, ‘A MOS Parameter Extraction Program for the BSIM Model’ ERL Memo
    Nos. ERL M84/99 and M84/100, Electronics Research Laboratory University of Califor-
    nia, Berkeley, November 1984

[5] Min-Chie Jeng, ‘Design and Modeling of Deep Submicrometer MOSFETSs’ ERL Memo
    Nos. ERL M90/90, Electronics Research Laboratory, University of California, Berkeley,
    October 1990

[6] Soyeon Park, ‘Analysis and SPICE implementation of High Temperature Effects on MOS-
    FET’, Master’s thesis, University of California, Berkeley, December 1986.

[7] Clement Szeto, ‘Simulation of Temperature Effects in MOSFETs (STEIM)’, Master’s the-
    sis, University of California, Berkeley, May 1988.

[8] J.S. Roychowdhury and D.O. Pederson, ‘Efficient Transient Simulation of Lossy Intercon-
    nect’, Proc. of the 28th ACM/IEEE Design Automation Conference, June 17-21 1991, San
    Francisco

[9] A. E. Parker and D. J. Skellern, ‘An Improved FET Model for Computer Simulators’, IEEE
    Trans CAD, vol. 9, no. 5, pp. 551-553, May 1990.

[10] R. Saleh and A. Yang, Editors, ‘Simulation and Modeling’, IEEE Circuits and Devices,
     vol. 8, no. 3, pp. 7-8 and 49, May 1992.

[11] H.Statz et al., ‘GaAs FET Device and Circuit Simulation in SPICE’, IEEE Transactions
     on Electron Devices, V34, Number 2, February 1987, pp160-169.

[12] Weidong Liu et al.: ‘BSIM3v3.2.2 MOSFET Model User’s Manual’, BSIM3v3.2.2

570                                                                        BIBLIOGRAPHY

[13] Weidong Lui et al.: ‘BSIM3.v3.3.0 MOSFET Model User’s Manual’, BSIM3v3.3.0

[14] ‘SPICE3.C1 Nutmeg Programmer’s Manual’, Department of Electrical Engineering and
     Computer Sciences, University of California, Berkeley, California, April, 1987.

[15] Thomas L. Quarles: SPICE3 Version 3C1 User’s Guide, Department of Electrical En-
     gineering and Computer Sciences, University of California, Berkeley, California, April,
     1989.

[16] Brian Kernighan and Dennis Ritchie: ‘The C Programming Language’, Second Edition,
     Prentice-Hall, Englewood Cliffs, New Jersey, 1988.

[17] ‘Code-Level Modeling in XSPICE’, F.L. Cox, W.B. Kuhn, J.P. Murray, and S.D. Tynor,
     published in the Proceedings of the 1992 International Symposium on Circuits and Sys-
     tems, San Diego, CA, May 1992, vol 2, pp. 871-874.

[18] ‘A Physically Based Compact Model of Partially Depleted SOI MOSFETs for Analog Cir-
     cuit Simulation’, Mike S. L. Lee, Bernard M. Tenbroek, William Redman-White, James
     Benson, and Michael J. Uren, IEEE JOURNAL OF SOLID-STATE CIRCUITS, VOL. 36,
     NO. 1, JANUARY 2001, pp. 110-121

[19] ‘A Realistic Large-signal MESFET Model for SPICE’, A. E. Parker, and D. J. Skellern,
     IEEE Transactions on Microwave Theory and Techniques, vol. 45, no. 9, Sept. 1997, pp.
     1563-1571.

[20] ‘Integrating RTS Noise into Circuit Analysis’, T. B. Tang and A. F. Murray, IEEE ISCAS,
     2009, Proc. of IEEE ISCAS, Taipei, Taiwan, May 2009, pp 585-588

[21] R. Storn, and K. Price: ‘Differential Evolution’, technical report TR-95-012, ICSI, March
     1995, see report download, or the DE web page

[22] M. J. M. Pelgrom e.a.: ‘Matching Properties of MOS Transistors’, IEEE J. Sol. State Circ,
     vol. 24, no. 5, Oct. 1989, pp. 1433-1440

[23] Y. V. Pershin, M. Di Ventra: ‘SPICE model of memristive devices with threshold’,
     arXiv:1204.2600v1 [physics.comp-ph] 12 Apr 2012, http://arxiv.org/pdf/1204.2600.pdf

[24] George M. Kull e.a. ‘A Unified Circuit Model for Bipolar Transistors Including Quasi-
     Saturation Effects’, IEEE TRANSACTIONS ON ELECTRON DEVICES, VOL. ED-32,
     NO. 6, JUNE 1985

[25] Matthias Bucher, Christophe Lallement, Christian Enz, Fabien Théodoloz, François
     Krummenacher, ‘The EPFL-EKV MOSFET Model Equations for Simulation’, Techni-
     cal Report, Revision II, July 1998, Electronics Laboratories, Swiss Federal Institute of
     Technology (EPFL), Lausanne, Switzerland

[26] Kenneth Kundert, Sparse Matrix Techniques, in Circuit Analysis, Simulation and Design,
     Albert Ruehli (Ed.), North-Holland, 1986

[27] T. A. Davis and Ekanathan Palamadai Natarajan. 2010. Algorithm 907: KLU, A Direct
     Sparse Solver for Circuit Simulation Problems. ACM Trans. Math. Softw. 37, 3, Article
     36 (September 2010), 17 pages. https://dl.acm.org/doi/abs/10.1145/1824801.1824814

[28] F. Lannutti, P. Nenzi and M. Olivieri, "KLU sparse direct linear solver implementation into
     NGSPICE," Proceedings of the 19th International Conference Mixed Design of Integrated
     Circuits and Systems - MIXDES 2012, Warsaw, Poland, 2012, pp. 69-73.
572   BIBLIOGRAPHY
           Part II

XSPICE Software User’s Manual
