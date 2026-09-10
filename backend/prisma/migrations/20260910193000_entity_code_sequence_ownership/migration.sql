-- Faz o RESTART IDENTITY dos ambientes de simulacao reiniciar tambem os codigos legiveis.
ALTER SEQUENCE "client_code_number_seq" OWNED BY "clients"."code";
ALTER SEQUENCE "equipment_code_number_seq" OWNED BY "generators"."code";
ALTER SEQUENCE "agent_code_number_seq" OWNED BY "users"."code";
