Version 4
SymbolType CELL
RECTANGLE Normal -48 -32 48 32
LINE Normal -64 0 -48 0
CIRCLE Normal 48 -6 60 6
LINE Normal 60 0 64 0
TEXT 0 0 Center 3 1
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_not
SYMATTR ModelFile dsp_not.sub
SYMATTR Description Verilog module dsp_not
PIN -64 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
