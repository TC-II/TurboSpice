Version 4
SymbolType CELL
RECTANGLE Normal -64 -64 64 64
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 d
LINE Normal 64 -32 80 -32
TEXT 58 -32 Right 1 q
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 empty
LINE Normal 64 32 80 32
TEXT 58 32 Right 1 full
LINE Normal -32 64 -32 96
LINE Normal -40 64 -32 54
LINE Normal -32 54 -24 64
LINE Normal 0 64 0 96
TEXT 0 54 Center 1 wr
LINE Normal 32 64 32 96
TEXT 32 54 Center 1 rd
TEXT 0 -50 Center 2 FIFO
WINDOW 0 0 -72 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_fifo
SYMATTR ModelFile dsp_fifo.sub
SYMATTR Description Verilog module dsp_fifo
PIN -32 96 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 0 96 NONE 0
PINATTR PinName wr
PINATTR SpiceOrder 2
PIN 32 96 NONE 0
PINATTR PinName rd
PINATTR SpiceOrder 3
PIN -80 0 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 4
PIN 80 -32 NONE 0
PINATTR PinName q[15:0]
PINATTR SpiceOrder 5
PIN 80 0 NONE 0
PINATTR PinName empty
PINATTR SpiceOrder 6
PIN 80 32 NONE 0
PINATTR PinName full
PINATTR SpiceOrder 7
