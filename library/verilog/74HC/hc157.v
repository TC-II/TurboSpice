// 74HC157: cuatro multiplexores de 2 a 1 con selección común: S = 0 elige A, S = 1 elige B; con G_n en 1, las Y en 0.
module hc157 (input A1, input B1, input A2, input B2, input A3, input B3, input A4, input B4,
              input S, input G_n, output Y1, output Y2, output Y3, output Y4);
  assign {Y4, Y3, Y2, Y1} = G_n ? 4'b0 : S ? {B4, B3, B2, B1} : {A4, A3, A2, A1};
endmodule
