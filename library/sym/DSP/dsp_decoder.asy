Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 sel
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 y
LINE Normal 0 32 0 64
TEXT 0 22 Center 1 en
TEXT 0 -20 Center 2 DEC
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n
SYMATTR Prefix X
SYMATTR Value dsp_decoder
SYMATTR ModelFile dsp_decoder.sub
SYMATTR Description Verilog module dsp_decoder
PIN -80 0 NONE 0
PINATTR PinName sel[2:0]
PINATTR SpiceOrder 1
PIN 0 64 NONE 0
PINATTR PinName en
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName y[7:0]
PINATTR SpiceOrder 3
