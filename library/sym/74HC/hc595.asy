Version 4
SymbolType CELL
RECTANGLE Normal -64 -160 64 160
TEXT 0 -148 Center 1 74HC595
LINE Normal -64 -128 -96 -128
TEXT -60 -128 Left 1 SER
TEXT -84 -136 Center 0 14
LINE Normal -64 -96 -96 -96
LINE Normal -64 -102 -56 -96
LINE Normal -56 -96 -64 -90
TEXT -52 -96 Left 1 SRCLK
TEXT -84 -104 Center 0 11
CIRCLE Normal -72 -68 -64 -60
LINE Normal -72 -64 -96 -64
TEXT -60 -64 Left 1 SRCLR
TEXT -84 -72 Center 0 10
LINE Normal -64 -32 -96 -32
LINE Normal -64 -38 -56 -32
LINE Normal -56 -32 -64 -26
TEXT -52 -32 Left 1 RCLK
TEXT -84 -40 Center 0 12
CIRCLE Normal -72 -4 -64 4
LINE Normal -72 0 -96 0
TEXT -60 0 Left 1 OE
TEXT -84 -8 Center 0 13
LINE Normal 64 -128 96 -128
TEXT 60 -128 Right 1 QA
TEXT 84 -136 Center 0 15
LINE Normal 64 -96 96 -96
TEXT 60 -96 Right 1 QB
TEXT 84 -104 Center 0 1
LINE Normal 64 -64 96 -64
TEXT 60 -64 Right 1 QC
TEXT 84 -72 Center 0 2
LINE Normal 64 -32 96 -32
TEXT 60 -32 Right 1 QD
TEXT 84 -40 Center 0 3
LINE Normal 64 0 96 0
TEXT 60 0 Right 1 QE
TEXT 84 -8 Center 0 4
LINE Normal 64 32 96 32
TEXT 60 32 Right 1 QF
TEXT 84 24 Center 0 5
LINE Normal 64 64 96 64
TEXT 60 64 Right 1 QG
TEXT 84 56 Center 0 6
LINE Normal 64 96 96 96
TEXT 60 96 Right 1 QH
TEXT 84 88 Center 0 7
LINE Normal 64 128 96 128
TEXT 60 128 Right 1 QH'
TEXT 84 120 Center 0 9
WINDOW 0 0 -168 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc595
SYMATTR ModelFile hc595.sub
SYMATTR Description 74HC595: 8-bit shift register with output latch and 3-state outputs
PIN -96 -128 NONE 0
PINATTR PinName ser
PINATTR SpiceOrder 1
PIN -96 -96 NONE 0
PINATTR PinName srclk
PINATTR SpiceOrder 2
PIN -96 -64 NONE 0
PINATTR PinName srclr_n
PINATTR SpiceOrder 3
PIN -96 -32 NONE 0
PINATTR PinName rclk
PINATTR SpiceOrder 4
PIN -96 0 NONE 0
PINATTR PinName oe_n
PINATTR SpiceOrder 5
PIN 96 -128 NONE 0
PINATTR PinName qa
PINATTR SpiceOrder 6
PIN 96 -96 NONE 0
PINATTR PinName qb
PINATTR SpiceOrder 7
PIN 96 -64 NONE 0
PINATTR PinName qc
PINATTR SpiceOrder 8
PIN 96 -32 NONE 0
PINATTR PinName qd
PINATTR SpiceOrder 9
PIN 96 0 NONE 0
PINATTR PinName qe
PINATTR SpiceOrder 10
PIN 96 32 NONE 0
PINATTR PinName qf
PINATTR SpiceOrder 11
PIN 96 64 NONE 0
PINATTR PinName qg
PINATTR SpiceOrder 12
PIN 96 96 NONE 0
PINATTR PinName qh
PINATTR SpiceOrder 13
PIN 96 128 NONE 0
PINATTR PinName qhs
PINATTR SpiceOrder 14
