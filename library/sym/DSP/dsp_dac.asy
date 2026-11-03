Version 4
SymbolType CELL
LINE Normal -40 -32 16 -32
LINE Normal 16 -32 44 0
LINE Normal 44 0 16 32
LINE Normal 16 32 -40 32
LINE Normal -40 32 -40 -32
LINE Normal -40 32 16 -32
TEXT -20 -12 Center 2 D
TEXT 12 14 Center 2 A
LINE Normal -64 0 -40 0
LINE Normal 44 0 64 0
LINE Normal -58 -4 -52 0
LINE Normal -52 0 -58 4
LINE Normal 54 -4 60 0
LINE Normal 60 0 54 4
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vref=1 vcc=5
SYMATTR Prefix X
SYMATTR Value dsp_dac
SYMATTR ModelFile DSP/dsp_dac.sub
SYMATTR Description Ideal 16-bit DAC: a Q1.15 word → vout = vref · word / 32768
PIN -64 0 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName vout
PINATTR SpiceOrder 2
