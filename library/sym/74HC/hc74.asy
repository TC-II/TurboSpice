Version 4
SymbolType CELL
RECTANGLE Normal -64 -80 64 80
TEXT 0 -68 Center 1 74HC74
LINE Normal -64 -48 -96 -48
TEXT -60 -48 Left 1 D
LINE Normal -64 -16 -96 -16
LINE Normal -64 -22 -56 -16
LINE Normal -56 -16 -64 -10
TEXT -52 -16 Left 1 CLK
CIRCLE Normal -72 12 -64 20
LINE Normal -72 16 -96 16
TEXT -60 16 Left 1 PRE
CIRCLE Normal -72 44 -64 52
LINE Normal -72 48 -96 48
TEXT -60 48 Left 1 CLR
LINE Normal 64 -48 96 -48
TEXT 60 -48 Right 1 Q
LINE Normal 64 -16 96 -16
TEXT 60 -16 Right 1 Q̅
WINDOW 0 0 -88 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc74
SYMATTR ModelFile hc74.sub
SYMATTR Description 74HC74: positive-edge D flip-flop with asynchronous preset and clear, active low (one of two)
PIN -96 -48 NONE 0
PINATTR PinName d
PINATTR SpiceOrder 1
PIN -96 -16 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 2
PIN -96 16 NONE 0
PINATTR PinName pre_n
PINATTR SpiceOrder 3
PIN -96 48 NONE 0
PINATTR PinName clr_n
PINATTR SpiceOrder 4
PIN 96 -48 NONE 0
PINATTR PinName q
PINATTR SpiceOrder 5
PIN 96 -16 NONE 0
PINATTR PinName q_n
PINATTR SpiceOrder 6
