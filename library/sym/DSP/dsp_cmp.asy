Version 4
SymbolType CELL
RECTANGLE Normal -64 -64 64 64
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 a
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 b
LINE Normal 64 -32 80 -32
TEXT 58 -32 Right 1 lt
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 eq
LINE Normal 64 32 80 32
TEXT 58 32 Right 1 gt
TEXT 0 -50 Center 2 a : b
WINDOW 0 0 -72 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16
SYMATTR Prefix X
SYMATTR Value dsp_cmp
SYMATTR ModelFile dsp_cmp.sub
SYMATTR Description Verilog module dsp_cmp
PIN -80 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -80 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 80 -32 NONE 0
PINATTR PinName lt
PINATTR SpiceOrder 3
PIN 80 0 NONE 0
PINATTR PinName eq
PINATTR SpiceOrder 4
PIN 80 32 NONE 0
PINATTR PinName gt
PINATTR SpiceOrder 5
