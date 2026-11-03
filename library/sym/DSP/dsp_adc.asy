Version 4
SymbolType CELL
LINE Normal -40 -32 16 -32
LINE Normal 16 -32 44 0
LINE Normal 44 0 16 32
LINE Normal 16 32 -40 32
LINE Normal -40 32 -40 -32
LINE Normal -40 32 16 -32
TEXT -20 -12 Center 2 A
TEXT 12 14 Center 2 D
LINE Normal -64 0 -40 0
LINE Normal 44 0 64 0
LINE Normal -16 32 -16 64
LINE Normal -24 32 -16 22
LINE Normal -16 22 -8 32
LINE Normal -58 -4 -52 0
LINE Normal -52 0 -58 4
LINE Normal 54 -4 60 0
LINE Normal 60 0 54 4
LINE Normal -12 58 -16 52
LINE Normal -16 52 -20 58
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vref=1 vcc=5
SYMATTR Prefix X
SYMATTR Value dsp_adc
SYMATTR ModelFile DSP/dsp_adc.sub
SYMATTR Description Ideal 16-bit ADC: vin (−vref … +vref) → a Q1.15 word, sampled on the rising edge of clk
PIN -64 0 NONE 0
PINATTR PinName vin
PINATTR SpiceOrder 1
PIN -16 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 2
PIN 64 0 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 3
