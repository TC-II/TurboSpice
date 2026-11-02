Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 idx
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 valid
TEXT 0 -34 Center 2 PRI
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n
SYMATTR Prefix X
SYMATTR Value dsp_prienc
SYMATTR ModelFile dsp_prienc.sub
SYMATTR Description Verilog module dsp_prienc
PIN -80 0 NONE 0
PINATTR PinName x[7:0]
PINATTR SpiceOrder 1
PIN 80 -16 NONE 0
PINATTR PinName idx[2:0]
PINATTR SpiceOrder 2
PIN 80 16 NONE 0
PINATTR PinName valid
PINATTR SpiceOrder 3
