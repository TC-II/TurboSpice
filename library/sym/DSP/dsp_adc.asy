Version 4
SymbolType CELL
RECTANGLE Normal -48 -32 48 32
LINE Normal -64 0 -48 0
LINE Normal 48 0 64 0
TEXT 0 0 Center 3 ADC
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vref=1 vcc=5
SYMATTR Prefix X
SYMATTR Value dsp_adc
SYMATTR ModelFile DSP/dsp_adc.sub
SYMATTR Description Ideal 16-bit ADC: vin (−vref … +vref) → a Q1.15 word
PIN -64 0 NONE 0
PINATTR PinName vin
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 2
