Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 q
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 tc
LINE Normal -48 48 -48 80
LINE Normal -56 48 -48 38
LINE Normal -48 38 -40 48
LINE Normal -16 48 -16 80
TEXT -16 38 Center 1 rst
LINE Normal 16 48 16 80
TEXT 16 38 Center 1 en
LINE Normal 48 48 48 80
TEXT 48 38 Center 1 down
TEXT 0 -34 Center 2 CTR
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n MOD=65536 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_counter
SYMATTR ModelFile dsp_counter.sub
SYMATTR Description Verilog module dsp_counter
PIN -48 80 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -16 80 NONE 0
PINATTR PinName rst
PINATTR SpiceOrder 2
PIN 16 80 NONE 0
PINATTR PinName en
PINATTR SpiceOrder 3
PIN 48 80 NONE 0
PINATTR PinName down
PINATTR SpiceOrder 4
PIN 80 -16 NONE 0
PINATTR PinName q[15:0]
PINATTR SpiceOrder 5
PIN 80 16 NONE 0
PINATTR PinName tc
PINATTR SpiceOrder 6
