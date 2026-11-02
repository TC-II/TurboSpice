Version 4
SymbolType CELL
RECTANGLE Normal -48 -32 48 32
LINE Normal -64 0 -48 0
LINE Normal 48 0 64 0
TEXT 0 0 Center 3 rev
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16
SYMATTR Prefix X
SYMATTR Value dsp_bitrev
SYMATTR ModelFile dsp_bitrev.sub
SYMATTR Description Verilog module dsp_bitrev
PIN -64 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
