import { ComponentStorage } from '../ecs/Component';
import type { CreatureShaderUniforms } from '../creatures/CreatureShader';

export interface ShaderStateData {
  uniforms: CreatureShaderUniforms;
}

export const ShaderStateStore = new ComponentStorage<ShaderStateData>();
