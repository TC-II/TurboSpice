Version 4
SymbolType CELL
RECTANGLE Normal -64 -160 64 160
TEXT 0 -148 Center 1 74HC163
LINE Normal -64 -128 -96 -128
TEXT -60 -128 Left 1 A
TEXT -84 -136 Center 0 3
LINE Normal -64 -96 -96 -96
TEXT -60 -96 Left 1 B
TEXT -84 -104 Center 0 4
LINE Normal -64 -64 -96 -64
TEXT -60 -64 Left 1 C
TEXT -84 -72 Center 0 5
LINE Normal -64 -32 -96 -32
TEXT -60 -32 Left 1 D
TEXT -84 -40 Center 0 6
LINE Normal -64 0 -96 0
TEXT -60 0 Left 1 ENP
TEXT -84 -8 Center 0 7
LINE Normal -64 32 -96 32
TEXT -60 32 Left 1 ENT
TEXT -84 24 Center 0 10
CIRCLE Normal -72 60 -64 68
LINE Normal -72 64 -96 64
TEXT -60 64 Left 1 LOAD
TEXT -84 56 Center 0 9
CIRCLE Normal -72 92 -64 100
LINE Normal -72 96 -96 96
TEXT -60 96 Left 1 CLR
TEXT -84 88 Center 0 1
LINE Normal -64 128 -96 128
LINE Normal -64 122 -56 128
LINE Normal -56 128 -64 134
TEXT -52 128 Left 1 CLK
TEXT -84 120 Center 0 2
LINE Normal 64 -128 96 -128
TEXT 60 -128 Right 1 QA
TEXT 84 -136 Center 0 14
LINE Normal 64 -96 96 -96
TEXT 60 -96 Right 1 QB
TEXT 84 -104 Center 0 13
LINE Normal 64 -64 96 -64
TEXT 60 -64 Right 1 QC
TEXT 84 -72 Center 0 12
LINE Normal 64 -32 96 -32
TEXT 60 -32 Right 1 QD
TEXT 84 -40 Center 0 11
LINE Normal 64 0 96 0
TEXT 60 0 Right 1 RCO
TEXT 84 -8 Center 0 15
WINDOW 0 0 -168 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil=1.5 vih=3.5 vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc163
SYMATTR ModelFile hc163.sub
SYMATTR Description 74HC163: 4-bit binary counter, synchronous load and clear
PIN -96 128 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -96 96 NONE 0
PINATTR PinName clr_n
PINATTR SpiceOrder 2
PIN -96 64 NONE 0
PINATTR PinName load_n
PINATTR SpiceOrder 3
PIN -96 0 NONE 0
PINATTR PinName enp
PINATTR SpiceOrder 4
PIN -96 32 NONE 0
PINATTR PinName ent
PINATTR SpiceOrder 5
PIN -96 -128 NONE 0
PINATTR PinName a
PINATTR SpiceOrder 6
PIN -96 -96 NONE 0
PINATTR PinName b
PINATTR SpiceOrder 7
PIN -96 -64 NONE 0
PINATTR PinName c
PINATTR SpiceOrder 8
PIN -96 -32 NONE 0
PINATTR PinName d
PINATTR SpiceOrder 9
PIN 96 -128 NONE 0
PINATTR PinName qa
PINATTR SpiceOrder 10
PIN 96 -96 NONE 0
PINATTR PinName qb
PINATTR SpiceOrder 11
PIN 96 -64 NONE 0
PINATTR PinName qc
PINATTR SpiceOrder 12
PIN 96 -32 NONE 0
PINATTR PinName qd
PINATTR SpiceOrder 13
PIN 96 0 NONE 0
PINATTR PinName rco
PINATTR SpiceOrder 14
