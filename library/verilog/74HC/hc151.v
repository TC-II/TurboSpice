// 74HC151: multiplexor de 8 a 1 con salida Y y su complemento W; con G_n en 1, Y = 0.
module hc151 (input D0, input D1, input D2, input D3, input D4, input D5, input D6, input D7,
              input A, input B, input C, input G_n, output Y, output W);
  wire [7:0] d = {D7, D6, D5, D4, D3, D2, D1, D0};
  assign Y = ~G_n & d[{C, B, A}];
  assign W = ~Y;
endmodule
