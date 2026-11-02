Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 q
LINE Normal -16 32 -16 64
LINE Normal -24 32 -16 22
LINE Normal -16 22 -8 32
LINE Normal 16 32 16 64
TEXT 16 22 Center 1 load
TEXT 0 -20 Center 2 PISO
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_piso
SYMATTR ModelFile dsp_piso.sub
SYMATTR Description Verilog module dsp_piso
PIN -16 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 16 64 NONE 0
PINATTR PinName load
PINATTR SpiceOrder 2
PIN -80 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 3
PIN 80 0 NONE 0
PINATTR PinName q
PINATTR SpiceOrder 4
