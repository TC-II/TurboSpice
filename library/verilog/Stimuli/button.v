// Pulsador con rebote: en reposo y = !ACTIVE; se aprieta en T_PRESS µs, se suelta T_HOLD µs después,
// y en cada cambio rebota N_BOUNCE veces en unos T_BOUNCE µs (tiempos al azar, los mismos con la
// misma SEED). Por omisión, activo en bajo: un pull-up y el botón a masa.
`timescale 1us/1ns
module button #(parameter T_PRESS = 1000, parameter T_HOLD = 20000, parameter T_BOUNCE = 2000, parameter N_BOUNCE = 6,
                parameter ACTIVE = 0, parameter SEED = 1) (output reg y);
  integer s = SEED;
  integer k;
  // N_BOUNCE cambios hacia v y desde v, con intervalos al azar de 0 a T_BOUNCE/N_BOUNCE (en ns): unos T_BOUNCE en total
  task rebote(input v);
    for (k = 0; k < 2 * N_BOUNCE; k = k + 1) begin
      y = k % 2 ? !v : v;
      #(({$random(s)} % (1000 * T_BOUNCE / N_BOUNCE)) / 1000.0);
    end
  endtask
  initial begin
    y = !ACTIVE;
    #(T_PRESS) rebote(ACTIVE);
    y = ACTIVE;
    #(T_HOLD) rebote(!ACTIVE);
    y = !ACTIVE;
  end
endmodule
