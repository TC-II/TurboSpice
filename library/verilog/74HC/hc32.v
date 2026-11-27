// 74HC32: OR de 2 entradas (una de las cuatro del integrado).
module hc32 (input A, input B, output Y);
  assign Y = A | B;
endmodule
