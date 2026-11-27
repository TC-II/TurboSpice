// 74HC86: XOR de 2 entradas (una de las cuatro del integrado).
module hc86 (input A, input B, output Y);
  assign Y = A ^ B;
endmodule
