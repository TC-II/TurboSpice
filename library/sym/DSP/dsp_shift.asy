Version 4
SymbolType CELL
LINE Normal -32 -32 -32 32
LINE Normal -32 32 32 0
LINE Normal 32 0 -32 -32
LINE Normal -64 0 -32 0
LINE Normal 32 0 64 0
TEXT -12 0 Center 1 2ᴷ
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n K=1 SAT=1 W=16
SYMATTR Prefix X
SYMATTR Value dsp_shift
SYMATTR ModelFile dsp_shift.sub
SYMATTR Description Verilog module dsp_shift
PIN -64 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
