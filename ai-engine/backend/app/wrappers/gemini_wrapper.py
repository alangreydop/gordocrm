"""Wrapper para Gemini API (Nano Banana 2) - Generación de imágenes."""

import asyncio
from typing import List, Optional, Dict, Any
import google.generativeai as genai
from ..core.config import settings


class GeminiAPIError(Exception):
    """Error en la API de Gemini."""

    pass


class GeminiWrapper:
    """Cliente para la API de Gemini."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY no configurada")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash-exp-image-generation")

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: Optional[str] = None,
        aspect_ratio: str = "1:1",
        num_images: int = 1,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """
        Genera imágenes usando Gemini.

        Args:
            prompt: Descripción de la imagen a generar
            negative_prompt: Lo que se quiere evitar en la imagen
            aspect_ratio: Relación de aspecto (1:1, 16:9, 9:16, 4:3, 3:4)
            num_images: Número de imágenes a generar (1-4)

        Returns:
            Lista de dicts con:
            - image_url: URL de la imagen generada
            - image_data: Base64 de la imagen (opcional)
            - prompt: Prompt usado
            - generation_time: Tiempo de generación en segundos
        """
        try:
            # Construir prompt completo
            full_prompt = prompt
            if negative_prompt:
                full_prompt += f"\n\nEvita: {negative_prompt}"

            # Configurar generación
            generation_config = {
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
            }

            # Ejecutar generación (blocking - ejecutar en thread pool)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(
                    full_prompt,
                    generation_config=generation_config,
                ),
            )

            # Procesar respuesta
            results = []
            for candidate in response.candidates[:num_images]:
                if hasattr(candidate, "content") and candidate.content:
                    # Extraer imagen de la respuesta
                    image_data = None
                    image_url = None

                    # Gemini devuelve imágenes en diferentes formatos
                    for part in candidate.content.parts:
                        if hasattr(part, "inline_data"):
                            image_data = part.inline_data.data
                        elif hasattr(part, "file_data"):
                            image_url = part.file_data.file_uri

                    results.append(
                        {
                            "image_url": image_url,
                            "image_data": image_data,
                            "prompt": prompt,
                            "aspect_ratio": aspect_ratio,
                            "generation_time": 0,  # Calcular si es necesario
                        }
                    )

            return results

        except Exception as e:
            raise GeminiAPIError(f"Error generando imagen: {str(e)}")

    async def generate_variations(
        self,
        image_url: str,
        prompt: Optional[str] = None,
        num_variations: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Genera variaciones de una imagen existente.

        Args:
            image_url: URL de la imagen original
            prompt: Prompt opcional para guiar las variaciones
            num_variations: Número de variaciones a generar

        Returns:
            Lista de dicts con las imágenes generadas
        """
        try:
            # Descargar imagen de referencia
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.get(image_url)
                response.raise_for_status()
                image_bytes = response.content

            # Subir imagen a Gemini
            loop = asyncio.get_event_loop()
            uploaded_image = await loop.run_in_executor(
                None,
                lambda: genai.upload_file(
                    path=None, data=image_bytes, mime_type="image/png"
                ),
            )

            # Construir prompt
            if prompt:
                full_prompt = f"Genera {num_variations} variaciones de esta imagen: {prompt}"
            else:
                full_prompt = f"Genera {num_variations} variaciones creativas de esta imagen"

            # Generar variaciones
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(
                    [uploaded_image, full_prompt],
                ),
            )

            # Procesar respuesta (similar a generate_image)
            results = []
            for candidate in response.candidates[:num_variations]:
                if hasattr(candidate, "content") and candidate.content:
                    image_url = None
                    image_data = None

                    for part in candidate.content.parts:
                        if hasattr(part, "inline_data"):
                            image_data = part.inline_data.data
                        elif hasattr(part, "file_data"):
                            image_url = part.file_data.file_uri

                    results.append(
                        {
                            "image_url": image_url,
                            "image_data": image_data,
                            "original_image": image_url,
                            "variation_prompt": prompt,
                        }
                    )

            return results

        except Exception as e:
            raise GeminiAPIError(f"Error generando variaciones: {str(e)}")
