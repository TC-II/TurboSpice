Version 4
SymbolType CELL
RECTANGLE Normal -64 -128 64 128
TEXT 0 -116 Center 1 74HC4511
LINE Normal -64 -96 -96 -96
TEXT -60 -96 Left 1 A
TEXT -84 -104 Center 0 7
LINE Normal -64 -64 -96 -64
TEXT -60 -64 Left 1 B
TEXT -84 -72 Center 0 1
LINE Normal -64 -32 -96 -32
TEXT -60 -32 Left 1 C
TEXT -84 -40 Center 0 2
LINE Normal -64 0 -96 0
TEXT -60 0 Left 1 D
TEXT -84 -8 Center 0 6
LINE Normal -64 32 -96 32
TEXT -60 32 Left 1 LE
TEXT -84 24 Center 0 5
CIRCLE Normal -72 60 -64 68
LINE Normal -72 64 -96 64
TEXT -60 64 Left 1 BI
TEXT -84 56 Center 0 4
CIRCLE Normal -72 92 -64 100
LINE Normal -72 96 -96 96
TEXT -60 96 Left 1 LT
TEXT -84 88 Center 0 3
LINE Normal 64 -96 96 -96
TEXT 60 -96 Right 1 a
TEXT 84 -104 Center 0 13
LINE Normal 64 -64 96 -64
TEXT 60 -64 Right 1 b
TEXT 84 -72 Center 0 12
LINE Normal 64 -32 96 -32
TEXT 60 -32 Right 1 c
TEXT 84 -40 Center 0 11
LINE Normal 64 0 96 0
TEXT 60 0 Right 1 d
TEXT 84 -8 Center 0 10
LINE Normal 64 32 96 32
TEXT 60 32 Right 1 e
TEXT 84 24 Center 0 9
LINE Normal 64 64 96 64
TEXT 60 64 Right 1 f
TEXT 84 56 Center 0 15
LINE Normal 64 96 96 96
TEXT 60 96 Right 1 g
TEXT 84 88 Center 0 14
WINDOW 0 0 -136 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc4511
SYMATTR ModelFile hc4511.sub
SYMATTR Description 74HC4511: BCD to 7-segment latch/decoder/driver (common cathode)
PIN -96 -96 NONE 0
PINATTR PinName a
PINATTR SpiceOrder 1
PIN -96 -64 NONE 0
PINATTR PinName b
PINATTR SpiceOrder 2
PIN -96 -32 NONE 0
PINATTR PinName c
PINATTR SpiceOrder 3
PIN -96 0 NONE 0
PINATTR PinName d
PINATTR SpiceOrder 4
PIN -96 32 NONE 0
PINATTR PinName le
PINATTR SpiceOrder 5
PIN -96 64 NONE 0
PINATTR PinName bi_n
PINATTR SpiceOrder 6
PIN -96 96 NONE 0
PINATTR PinName lt_n
PINATTR SpiceOrder 7
PIN 96 -96 NONE 0
PINATTR PinName seg_a
PINATTR SpiceOrder 8
PIN 96 -64 NONE 0
PINATTR PinName seg_b
PINATTR SpiceOrder 9
PIN 96 -32 NONE 0
PINATTR PinName seg_c
PINATTR SpiceOrder 10
PIN 96 0 NONE 0
PINATTR PinName seg_d
PINATTR SpiceOrder 11
PIN 96 32 NONE 0
PINATTR PinName seg_e
PINATTR SpiceOrder 12
PIN 96 64 NONE 0
PINATTR PinName seg_f
PINATTR SpiceOrder 13
PIN 96 96 NONE 0
PINATTR PinName seg_g
PINATTR SpiceOrder 14
