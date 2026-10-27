Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
TEXT 0 -24 Center 2 Σ ÷64
TEXT 0 24 Center 1 downsampler
LINE Normal -96 0 -64 0
TEXT -60 0 Left 1 y
LINE Normal 64 0 96 0
LINE Normal 72 8 84 -8
TEXT 78 -14 Center 1 7
TEXT 60 0 Right 1 value
LINE Normal 0 80 0 48
LINE Normal -6 48 0 40
LINE Normal 0 40 6 48
TEXT -4 72 Right 1 clk
WINDOW 0 0 -56 Bottom 2
WINDOW 3 24 56 Left 2
SYMATTR Prefix X
SYMATTR Value DOWNSAMPLER
SYMATTR ModelFile DOWNSAMPLER.sub
SYMATTR Description Verilog module DOWNSAMPLER
PIN 0 80 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -96 0 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 2
PIN 96 0 NONE 0
PINATTR PinName value[6:0]
PINATTR SpiceOrder 3
