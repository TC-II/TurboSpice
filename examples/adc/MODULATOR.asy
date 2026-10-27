Version 4
SymbolType CELL
LINE Normal -112 0 -64 -80
LINE Normal -64 -80 112 -80
LINE Normal 112 -80 112 80
LINE Normal 112 80 -64 80
LINE Normal -64 80 -112 0
TEXT 24 -64 Center 2 ΣΔ modulator
LINE Normal -144 0 -112 0
LINE Normal -112 0 -92 0
LINE Normal -92 0 -92 -8
LINE Normal -92 -8 -76 -8
LINE Normal -76 -24 -76 24
LINE Normal -76 24 -44 0
LINE Normal -44 0 -76 -24
TEXT -73 -10 Left 1 +
TEXT -73 10 Left 1 −
LINE Normal -84 8 -76 8
LINE Normal -84 8 -84 32
LINE Normal -84 32 -72 32
TEXT -68 32 Left 1 vcc/2
LINE Normal -44 0 -24 0
LINE Normal -24 0 -24 -16
LINE Normal -24 -16 0 -16
RECTANGLE Normal 0 -40 56 24
TEXT 4 -16 Left 1 D
TEXT 52 -32 Right 1 /Q
TEXT 52 8 Right 1 Q
TEXT 28 -32 Center 1 FF
LINE Normal 22 24 28 16
LINE Normal 28 16 34 24
LINE Normal 56 -32 144 -32
LINE Normal 56 8 80 8
LINE Normal 80 8 80 32
LINE Normal 80 32 144 32
TEXT 128 -40 Center 1 fb
TEXT 128 24 Center 1 y
LINE Normal -16 112 -16 48
LINE Normal -16 48 28 48
LINE Normal 28 48 28 24
TEXT -12 96 Left 1 clk
WINDOW 0 0 -88 Bottom 2
WINDOW 3 64 88 Top 2
SYMATTR Prefix X
SYMATTR Value MODULATOR
SYMATTR ModelFile MODULATOR.sub
SYMATTR Description Verilog module MODULATOR
PIN -16 112 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -144 0 NONE 0
PINATTR PinName cmp
PINATTR SpiceOrder 2
PIN 144 32 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 3
PIN 144 -32 NONE 0
PINATTR PinName fb
PINATTR SpiceOrder 4
